import { Bot, Context, InlineKeyboard, InputFile, session, type SessionFlavor } from "grammy";
import dotenv from "dotenv";
import mongoose from "mongoose";
import * as viem from "viem"
import { sendToken } from "./blockchain/sendToken";
import { Tokens } from "./lib/tokens";
import { getTokenBalance } from "./blockchain/getBalance";
import { type PaymentPayload, PaymentStatus, PaymentStep, type SessionData } from "./lib/types";
import { PaymentAlreadyCompletedError, PreCheckoutError } from "./lib/CustomErrors";
import { SupportedChains, CHAIN_CONFIG } from "./lib/chains";
import { formatEther, parseEther } from "viem";
import { InsufficientVaultBalanceError } from "./lib/CustomErrors";
import { EXCHANGE_SUMMARY, INSUFFICIENT_VAULT_BALANCE, LOADING_STATE, SUCCESSFUL_EXCHANGE, WINDOWS_ERROR } from "./lib/links";
import { calculateTransactionBreakdown, FEES } from "./lib/fees";
import { escapeMarkdown, formatNumber, formatAddress, getNetworkIndicator } from "./lib/helper";

dotenv.config();

// Define mongoose schema
const userSchema = new mongoose.Schema({
    chatId: { type: Number, required: true, unique: true },
    walletAddress: String,
});

const paymentsSchema = new mongoose.Schema({
    chatId: { type: Number, required: true },
    walletAddress: { type: String, required: true },
    chain: { type: String, required: true },
    token: { type: String, required: true },
    stars: { type: Number, required: true },
    amountInToken: { type: Number, required: true },
    amountInUSD: { type: Number, required: true },
    operationalFee: { type: Number, required: true },
    serviceFee: { type: Number, required: true },
    totalFees: { type: Number, required: true },
    creationTimestamp: { type: Date, default: Date.now },
    completionTimestamp: { type: Date, required: false },
    status: { type: String, required: true },
    telegramPaymentChargeId: { type: String, required: false },
    transactionId: { type: String, required: false },
})

const User = mongoose.model('User', userSchema);
const Payment = mongoose.model('Payment', paymentsSchema);

// Custom context type
type MyContext = Context & SessionFlavor<SessionData>;

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);
const TRANSACTIONS_PER_PAGE = 5;

function initial(): SessionData {
    return {
        step: PaymentStep.IDLE,
        walletAddress: "",
        selectedChain: null,
        selectedToken: null,
    };
}
// Add this before registering any command handlers
bot.use(session({ initial }));
       
// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI!)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Available chains and tokens (you can expand this)
const SUPPORTED_CHAINS: {[key: string]: string} = {
    [SupportedChains.BSC]: "Binance Smart Chain",
    [SupportedChains.OPBNB]: "opBNB"
};

const SUPPORTED_TOKENS: {[key: string]: Tokens[]} = {
    [SupportedChains.BSC]: [Tokens.USDT, Tokens.USDC],
    [SupportedChains.OPBNB]: [Tokens.USDT]
};


// Set bot commands
await bot.api.setMyCommands([
    { command: "start", description: "Start the bot" },
    { command: "help", description: "Show help text" },
    { command: "buy", description: "Buy tokens with stars" },
    { command: "history", description: "View Payment history" },
    { command: "wallet", description: "View your wallet address" },
    { command: "addwallet", description: "Add or update wallet address" },
    { command: "removewallet", description: "Remove your wallet address" },
    // { command: "simulate", description: "Test the payment flow (simulation)" }
]);

// Start command
bot.command("start", async (ctx) => {
    const user = await User.findOne({ chatId: ctx.chat.id });
    if (!user) {
        await User.create({ chatId: ctx.chat.id });
    }

    const testnetWarning = process.env.TESTNET === "true" ? 
        "\n\n*⚠️ NOTE: WE ARE CURRENTLY ON TESTNET ONLY\\!*\n" +
        "All purchases will be processed on test networks\\." : "";

    await ctx.replyWithPhoto(new InputFile("./assets/star-bridge-bright.webp"), {
        caption: "Welcome to Star Bridge\\! ⭐\n\n" +  // Escaped the !
        "Convert your Telegram Stars into crypto instantly\\!" +  // Escaped the !
        testnetWarning + "\n\n" +
        "Quick Start:\n" +
        "• /buy \\- Convert Stars to crypto\n" +  // Escaped the -
        "• /wallet \\- Set up your crypto wallet\n" +  // Escaped the -
        "• /history \\- View your conversion history\n\n" +  // Escaped the -
        "Need help\\? Use /help for more information\\.",  // Escaped the ?
        parse_mode: "MarkdownV2"
    });
});

// View wallet command
bot.command("wallet", async (ctx) => {
    const user = await User.findOne({ chatId: ctx.chat.id });

    if (!user?.walletAddress) {
        return ctx.reply(
            "No wallet address set. Use /addwallet <your_address> to set one."
        );
    }

    return ctx.reply(
        `Your current wallet address is: ${formatAddress(user.walletAddress)}\n\n` +
        "Use /addwallet to update it or /removewallet to remove it",
        { parse_mode: "MarkdownV2" }
    );
});

// Add/Update wallet command
bot.command("addwallet", async (ctx) => {
    const address = ctx.match;

    if (!address) {
        return ctx.reply(
            "Please provide a wallet address:\n" +
            "/addwallet <your_address>"
        );
    }

    if (!viem.isAddress(address)) {
        return ctx.reply("❌ Invalid wallet address. Please provide a valid address.");
    }

    const user = await User.findOneAndUpdate(
        { chatId: ctx.chat.id },
        {
            $set: { walletAddress: address }
        },
        { upsert: true }
    );

    return ctx.reply(
        `✅ Wallet address ${user?.walletAddress ? 'updated' : 'set'} to: ${formatAddress(address)}`,
        { parse_mode: "MarkdownV2" }
    );
});

// Remove wallet command
bot.command("removewallet", async (ctx) => {
    const user = await User.findOne({ chatId: ctx.chat.id });

    if (!user?.walletAddress) {
        return ctx.reply("You don't have a wallet address set.");
    }

    await User.findOneAndUpdate(
        { chatId: ctx.chat.id },
        { $unset: { walletAddress: "" } }
    );

    return ctx.reply("✅ Wallet address has been removed.");
});

// Buy command
bot.command("buy", async (ctx) => {
    const user = await User.findOne({ chatId: ctx.chat.id });

    if (!user?.walletAddress) {
        return ctx.reply(
            "⚠️ Wallet Setup Required\n\n" +
            "Before converting your Stars to crypto, please set up your wallet using /addwallet"
        );
    }

    const starsArg = ctx.match;
    if (!starsArg) {
        return ctx.reply(
            "Please specify the number of stars:\n" +
            "/buy <number_of_stars>\n\n" +
            `Example: /buy ${Math.ceil(FEES.minimumTx / FEES.baseRate)} (minimum amount)`
        );
    }

        // Add testnet warning if in testnet mode
        if (process.env.TESTNET === "true") {
            await ctx.reply(
                "*⚠️ TESTNET MODE ACTIVE*\n\n" +
                "Please note that all transactions are currently processed on test networks\\. " +
                "These tokens have no real value\\.",
            { parse_mode: "MarkdownV2" }
        );
    }

    const stars = parseInt(starsArg);
    if (isNaN(stars) || stars <= 0) {
        return ctx.reply("Please enter a valid number of stars.");
    }

    try {
        const breakdown = calculateTransactionBreakdown(stars);

        ctx.session.walletAddress = user.walletAddress;
        ctx.session.stars = stars;
        ctx.session.amountInUSD = breakdown.netAmount; // Store net amount after fees

        // Create chain selection keyboard
        const keyboard = new InlineKeyboard();
        Object.entries(SUPPORTED_CHAINS).forEach(([key, name]) => {
            keyboard.text(name, `chain_${key}`).row();
        });

        await ctx.reply(
            `💫 *Converting ${stars} Stars*\n\n` +
            `Base Amount: \\$${formatNumber(breakdown.originalAmount)}\n` +
            `Fees Breakdown:\n` +
            `• Operational Fee: \\$${formatNumber(breakdown.operationalFee)}\n` +
            `• Service Fee: \\$${formatNumber(breakdown.percentageFee)} ` +
            `\\(${breakdown.originalAmount >= 500 ? '1' : '2'}\\%\\)\n\n` +
            `*Net Amount: \\$${formatNumber(breakdown.netAmount)}*\n\n` +
            `Select blockchain network:`,
            { 
                reply_markup: keyboard,
                parse_mode: "MarkdownV2" 
            }
        );

    } catch (error) {
        console.error('Fee calculation error:', error);
        if (error instanceof Error && error.message.includes('Minimum transaction')) {
            return ctx.reply(
                `⚠️ Minimum transaction amount is $${FEES.minimumTx}\n` +
                `This requires at least ${Math.ceil(FEES.minimumTx / FEES.baseRate)} stars`
            );
        }
        return ctx.reply("An error occurred while processing your request.");
    }
});

// Handle chain selection
bot.callbackQuery(/^chain_(.+)$/, async (ctx) => {
    const chain = ctx.match[1];
    ctx.session.selectedChain = chain as SupportedChains;

    // Create token selection keyboard
    const keyboard = new InlineKeyboard();
    SUPPORTED_TOKENS[chain as keyof typeof SUPPORTED_TOKENS].forEach((token: string) => {
        keyboard.text(token, `token_${token}`).row();
    });

    await ctx.editMessageText("Select token:", { reply_markup: keyboard });
});

// Handle token selection
bot.callbackQuery(/^token_(.+)$/, async (ctx) => {
    const token = ctx.match[1];
    ctx.session.selectedToken = token as Tokens;

    const stars = ctx.session.stars!;
    const breakdown = calculateTransactionBreakdown(stars);

    // Create payment payload
    const payload: PaymentPayload = {
        chatId: ctx.chat!.id,
        walletAddress: ctx.session.walletAddress,
        chain: ctx.session.selectedChain!,
        token: ctx.session.selectedToken!,
        stars: stars,
        amountInToken: breakdown.netAmount,
        amountInUSD: breakdown.netAmount,
        operationalFee: breakdown.operationalFee,
        serviceFee: breakdown.percentageFee,
        totalFees: breakdown.totalFees,
        creationTimestamp: Date.now(),
        status: PaymentStatus.PENDING,
        telegramPaymentChargeId: '',
        transactionId: ''
    };

    try {
        // Check vault balance first
        const vaultBalance = await getTokenBalance(payload.chain, payload.token);
        const requiredAmount = parseEther(payload.amountInToken.toFixed(3));

        if (vaultBalance < requiredAmount) {
            throw new InsufficientVaultBalanceError(
                payload.token,
                Number(formatEther(requiredAmount)),
                Number(formatEther(vaultBalance)),
                payload.chain
            );
        }

        await ctx.editMessageMedia({
            type: "animation",
            media: EXCHANGE_SUMMARY,
            caption: 
                `*🌉 Star Bridge Exchange Summary*\n\n` +
                `*Network:* _${escapeMarkdown(SUPPORTED_CHAINS[payload.chain])} ${getNetworkIndicator()}_\n` +
                `*Destination:* ${formatAddress(payload.walletAddress)}\n\n` +
                `*Token:* _${escapeMarkdown(payload.token)}_\n` +
                `*Amount:* _${formatNumber(payload.amountInToken)} ${escapeMarkdown(payload.token)}_\n` +
                `*Stars:* _${payload.stars}_ ⭐\n` +
                `*USD Value:* _\\$${formatNumber(payload.amountInUSD)}_\n` +
                `*Status:* _Awaiting Payment_\n` +
                `To bridge your tokens, please send *${payload.stars} stars*`,
            parse_mode: "MarkdownV2"
        });

        ctx.session.step = PaymentStep.PAYMENT_PENDING;
        
        // First, create and store the full payment in DB
        const fullPayment = await Payment.create(payload);

        // Create a minimal payload for the invoice
        const minimalPayload = {
            paymentId: fullPayment._id,
            stars: payload.stars,
            chain: payload.chain,
            token: payload.token,
            amountInToken: payload.amountInToken
        };

        await bot.api.sendInvoice(
            payload.chatId,
            `${payload.token} Payment`,
            `Payment of $${payload.amountInUSD.toFixed(3)} ${payload.token} on ${payload.chain}`,
            JSON.stringify(minimalPayload),  // Minimal payload with only necessary data
            "XTR",
            [{label: "Confirm", amount: payload.stars}]
        );

    } catch (error) {
        console.error('Payment initiation error:', error);
        
        let errorMessage = "⚠️ *Payment Failed*\n\n";
        let animation;
        
        if (error instanceof InsufficientVaultBalanceError) {
            animation = INSUFFICIENT_VAULT_BALANCE
            errorMessage += `❌ *Insufficient Vault Balance*\n\n` +
                `Chain: ${escapeMarkdown(error.chain)}\n` +
                `Token: ${escapeMarkdown(error.token)}\n` +
                `Required: ${formatNumber(error.required)} ${escapeMarkdown(error.token)}\n` +
                `Available: ${formatNumber(error.available)} ${escapeMarkdown(error.token)}`;
        } else {
            errorMessage += "There was an error initiating your payment\\.";
        }
        if (animation) {
            await ctx.editMessageMedia({
                type: "animation",
                media: animation,
                caption: errorMessage,
                parse_mode: "MarkdownV2"
            })
        } else {
            await ctx.editMessageMedia({
                type: "animation",
                media: WINDOWS_ERROR,
                caption: errorMessage,
                parse_mode: "MarkdownV2"
            });
        }
    }
});

bot.on("pre_checkout_query", async(ctx) => {
    try {
        const minimalPayload = JSON.parse(ctx.preCheckoutQuery.invoice_payload);

        if (minimalPayload.stars !== ctx.preCheckoutQuery.total_amount) {
            throw new PreCheckoutError("Stars amount mismatch");
        }

        const vaultBalance = await getTokenBalance(minimalPayload.chain, minimalPayload.token);
        const requiredAmount = parseEther(minimalPayload.amountInToken.toFixed(3));

        if (vaultBalance < requiredAmount) {
            throw new InsufficientVaultBalanceError(
                minimalPayload.token,
                Number(requiredAmount),
                Number(vaultBalance),
                minimalPayload.chain
            );
        }

        const payment = await Payment.findById(minimalPayload.paymentId);

        if(payment?.status === PaymentStatus.COMPLETED) {
            throw new PaymentAlreadyCompletedError(`Payment already completed ~ Refunding stars`);
        }

        // Update payment status using the stored ID
        await Payment.findByIdAndUpdate(minimalPayload.paymentId, {
            status: PaymentStatus.PROCESSING
        });

        await ctx.answerPreCheckoutQuery(true);

    } catch (error) {
        console.error('Pre-checkout error:', error);
        
        if (error instanceof InsufficientVaultBalanceError) {
            await ctx.answerPreCheckoutQuery(
                false, 
                `Insufficient vault balance. Available: ${error.available} ${error.token}`
            );
        } else if (error instanceof PreCheckoutError) {
            await ctx.answerPreCheckoutQuery(false, error.message);
        } else if (error instanceof PaymentAlreadyCompletedError) {
            await ctx.answerPreCheckoutQuery(false, error.message);
        } else {
            await ctx.answerPreCheckoutQuery(false, "An error occurred");
        }
    }
});

// Update successful payment handler
bot.on(":successful_payment", async (ctx) => {
    console.log("Successful payment received");

    if (!ctx.message?.successful_payment.invoice_payload || !ctx.from.id) {
        return;
    }

    const payload = JSON.parse(ctx.message.successful_payment.invoice_payload);
    const paymentId = payload.paymentId;

    if (!paymentId) {
        return ctx.reply("⚠️ Payment ID not found");
    }

    const loadingState = await ctx.replyWithAnimation(LOADING_STATE);

    try {
        const payment = await Payment.findById(paymentId);
        if (!payment) {
            throw new Error('Payment not found');
        }
        
        // Process the token transfer
        const tx = await sendToken(
            payment.walletAddress as `0x${string}`,
            payment.chain as SupportedChains,
            payment.token as Tokens,
            payment.amountInToken
        );

        // Update payment status
        await Payment.findByIdAndUpdate(payment._id, {
            status: PaymentStatus.COMPLETED,
            transactionId: tx,
            telegramPaymentChargeId: ctx.message.successful_payment.provider_payment_charge_id,
            completionTimestamp: new Date()
        });

        await ctx.api.editMessageMedia(loadingState.chat.id, loadingState.message_id, {
            type: "animation",
            media: SUCCESSFUL_EXCHANGE
        });

        await ctx.reply(
            `✅ *Payment Successful\\!* ${getNetworkIndicator()}\n\n` +
            `Transaction Hash: ${formatAddress(tx)}\n\n` +
            `${escapeMarkdown(CHAIN_CONFIG[payment.chain as SupportedChains].explorer)}/tx/${escapeMarkdown(tx)}`,
            { parse_mode: "MarkdownV2" }
        );

    } catch (error) {
        console.error('Payment processing error:', error);
        await ctx.api.deleteMessage(ctx.chat.id, loadingState.message_id);

        await ctx.reply("⚠️ There was an error processing your payment. Our team has been notified.");
        
        // Update payment status to failed
        await Payment.findByIdAndUpdate(paymentId, {
            status: PaymentStatus.FAILED
        });
        
        // You might want to implement a refund mechanism here
        await ctx.refundStarPayment();
    } finally {
        // Reset session
        ctx.session.step = PaymentStep.IDLE;
        ctx.session.currentPaymentId = undefined;
    }
});

// Help command
bot.command("help", async (ctx) => {
    await ctx.reply(
        "Star Bridge - Convert Stars to Crypto! ⭐\n\n" +
        "📱 Main Commands:\n" +
        "• /buy - Convert Stars to crypto\n" +
        "• /wallet - Set up your crypto wallet\n" +
        "• /addwallet - Add/update wallet\n" +
        "• /removewallet - Remove wallet\n" +
        "• /history - View conversion history\n\n" +
        "💡 How it works:\n" +
        "1. Set up your crypto wallet\n" +
        "2. Choose your preferred crypto\n" +
        "3. Send Stars to receive crypto\n\n" +
        "Need help? Contact @StarBridgeSupport"
    );
});

// History command
bot.command("history", async (ctx) => {
    const page = 1; // Start with first page
    const payments = await Payment.find({ chatId: ctx.chat.id })
        .sort({ creationTimestamp: -1 }) // Sort by newest first
        .skip((page - 1) * TRANSACTIONS_PER_PAGE)
        .limit(TRANSACTIONS_PER_PAGE);

    const totalPayments = await Payment.countDocuments({ chatId: ctx.chat.id });
    const totalPages = Math.ceil(totalPayments / TRANSACTIONS_PER_PAGE);

    if (!payments?.length) {
        return ctx.reply("You haven't made any Payments yet.");
    }

    const history = payments
        .map((payment, i) =>
            `${(page - 1) * TRANSACTIONS_PER_PAGE + i + 1}. ${payment.amountInToken} ${payment.token} on ${payment.chain}\n` +
            `   Stars: ${payment.stars} ⭐\n` +
            `   Status: ${payment.status}\n` +
            `   Date: ${payment.completionTimestamp?.toLocaleDateString()}`
        )
        .join('\n\n');

    // Create pagination keyboard
    const keyboard = new InlineKeyboard();
    
    // Add navigation buttons
    if (totalPages > 1) {
        if (page > 1) keyboard.text('⬅️ Previous', `history_${page - 1}`);
        keyboard.text(`${page}/${totalPages}`, 'current_page');
        if (page < totalPages) keyboard.text('Next ➡️', `history_${page + 1}`);
    }

    await ctx.reply(
        `Payment History (Page ${page}/${totalPages}):\n\n${history}`,
        { reply_markup: keyboard }
    );
});

// Handle pagination callbacks
bot.callbackQuery(/^history_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    
    const payments = await Payment.find({ chatId: ctx.chat!.id })
        .sort({ creationTimestamp: -1 })
        .skip((page - 1) * TRANSACTIONS_PER_PAGE)
        .limit(TRANSACTIONS_PER_PAGE);

    const totalPayments = await Payment.countDocuments({ chatId: ctx.chat!.id });
    const totalPages = Math.ceil(totalPayments / TRANSACTIONS_PER_PAGE);

    const history = payments
        .map((payment, i) =>
            `${(page - 1) * TRANSACTIONS_PER_PAGE + i + 1}. ${payment.amountInToken} ${payment.token} on ${payment.chain}\n` +
            `   Stars: ${payment.stars} ⭐\n` +
            `   Status: ${payment.status}\n` +
            `   Date: ${payment.completionTimestamp?.toLocaleDateString()}`
        )
        .join('\n\n');

    // Create pagination keyboard
    const keyboard = new InlineKeyboard();
    
    // Add navigation buttons
    if (totalPages > 1) {
        if (page > 1) keyboard.text('⬅️ Previous', `history_${page - 1}`);
        keyboard.text(`${page}/${totalPages}`, 'current_page');
        if (page < totalPages) keyboard.text('Next ➡️', `history_${page + 1}`);
    }

    await ctx.editMessageText(
        `Payment History (Page ${page}/${totalPages}):\n\n${history}`,
        { reply_markup: keyboard }
    );
});

// Handle current page button (do nothing)
bot.callbackQuery('current_page', async (ctx) => {
    await ctx.answerCallbackQuery();
});

// Add this new test command handler
// bot.command("simulate", async (ctx) => {
//     const user = await User.findOne({ chatId: ctx.chat.id });

//     if (!user?.walletAddress) {
//         return ctx.reply(
//             "⚠️ Wallet Setup Required\n\n" +
//             "Before testing, please set up your wallet using /addwallet"
//         );
//     }

//     const starsArg = ctx.match;
//     if (!starsArg) {
//         return ctx.reply(
//             "Please specify the number of stars:\n" +
//             "/simulate <number_of_stars>\n\n" +
//             `Example: /simulate ${Math.ceil(FEES.minimumTx / FEES.baseRate)} (minimum amount)`
//         );
//     }

//     const stars = parseInt(starsArg);
//     if (isNaN(stars) || stars <= 0) {
//         return ctx.reply("Please enter a valid number of stars.");
//     }

//     try {
//         const breakdown = calculateTransactionBreakdown(stars);

//         // Simulate a payment
//         const simulatedPayload: PaymentPayload = {
//             chatId: ctx.chat.id,
//             walletAddress: user.walletAddress,
//             chain: SupportedChains.OPBNB,
//             token: Tokens.USDT,
//             stars: stars,
//             amountInToken: breakdown.netAmount,
//             amountInUSD: breakdown.netAmount,
//             operationalFee: breakdown.operationalFee,
//             serviceFee: breakdown.percentageFee,
//             totalFees: breakdown.totalFees,
//             creationTimestamp: Date.now(),
//             status: PaymentStatus.PENDING,
//             telegramPaymentChargeId: 'test-payment-' + Date.now(),
//             transactionId: ''
//         };

//         // Create payment record in DB
//         const payment = await Payment.create(simulatedPayload);

//         await ctx.reply(
//             `🧪 *TEST MODE: Simulating payment flow* ${getNetworkIndicator()}\n\n` +
//             `Converting ${stars} Stars\n\n` +
//             `Base Amount: \\$${formatNumber(breakdown.originalAmount)}\n` +
//             `Fees Breakdown:\n` +
//             `• Operational Fee: \\$${formatNumber(breakdown.operationalFee)}\n` +
//             `• Service Fee: \\$${formatNumber(breakdown.percentageFee)} ` +
//             `\\(${breakdown.originalAmount >= 500 ? '1' : '2'}\\%\\)\n\n` +
//             `*Net Amount: \\$${formatNumber(breakdown.netAmount)}*`,
//             { parse_mode: "MarkdownV2" }
//         );

//         const loadingState = await ctx.replyWithAnimation(LOADING_STATE);

//         // Simulate processing delay
//         await new Promise(resolve => setTimeout(resolve, 2000));

//         try {
//             // Check vault balance first
//             const vaultBalance = await getTokenBalance(simulatedPayload.chain, simulatedPayload.token);
//             const requiredAmount = parseEther(simulatedPayload.amountInToken.toFixed(3));

//             if (vaultBalance < requiredAmount) {
//                 throw new InsufficientVaultBalanceError(
//                     simulatedPayload.token,
//                     Number(formatEther(requiredAmount)),
//                     Number(formatEther(vaultBalance)),
//                     simulatedPayload.chain
//                 );
//             }

//             // Process the token transfer
//             const tx = await sendToken(
//                 simulatedPayload.walletAddress as `0x${string}`,
//                 simulatedPayload.chain,
//                 simulatedPayload.token,
//                 simulatedPayload.amountInToken
//             );

//             // Update payment status
//             await Payment.findByIdAndUpdate(payment._id, {
//                 status: PaymentStatus.COMPLETED,
//                 transactionId: tx,
//                 completionTimestamp: new Date()
//             });

//             await ctx.api.editMessageMedia(loadingState.chat.id, loadingState.message_id, {
//                 type: "animation",
//                 media: SUCCESSFUL_EXCHANGE
//             });

//             await ctx.reply(
//                 `✅ *Test Payment Successful\\!* ${getNetworkIndicator()}\n\n` +
//                 `Transaction Hash: ${formatAddress(tx)}\n\n` +
//                 `Profit earned: \\$${formatNumber(breakdown.totalFees)}\n\n` +
//                 `${escapeMarkdown(CHAIN_CONFIG[simulatedPayload.chain].explorer)}/tx/${escapeMarkdown(tx)}`,
//                 { parse_mode: "MarkdownV2" }
//             );

//         } catch (error) {
//             console.error('Test payment processing error:', error);
//             await ctx.api.deleteMessage(ctx.chat.id, loadingState.message_id);

//             let errorMessage = "⚠️ *Test Payment Failed*\n\n";
            
//             if (error instanceof InsufficientVaultBalanceError) {
//                 errorMessage += `❌ *Insufficient Vault Balance*\n\n` +
//                     `Chain: ${escapeMarkdown(error.chain)}\n` +
//                     `Token: ${escapeMarkdown(error.token)}\n` +
//                     `Required: ${formatNumber(error.required)} ${escapeMarkdown(error.token)}\n` +
//                     `Available: ${formatNumber(error.available)} ${escapeMarkdown(error.token)}`;
//             } else {
//                 errorMessage += "There was an error processing your test payment\\.";
//             }
            
//             await ctx.reply(errorMessage, { parse_mode: "MarkdownV2" });
            
//             // Update payment status to failed
//             await Payment.findByIdAndUpdate(payment._id, {
//                 status: PaymentStatus.FAILED,
//                 completionTimestamp: new Date()
//             });
//         }
//     } catch (error) {
//         console.error('Fee calculation error:', error);
//         if (error instanceof Error && error.message.includes('Minimum transaction')) {
//             return ctx.reply(
//                 `⚠️ Minimum transaction amount is $${FEES.minimumTx}\n` +
//                 `This requires at least ${Math.ceil(FEES.minimumTx / FEES.baseRate)} stars`
//             );
//         }
//         return ctx.reply("An error occurred while processing your request.");
//     }
// });

// Start the bot
bot.start();