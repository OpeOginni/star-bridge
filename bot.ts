import { Bot, Context, InlineKeyboard, InputFile, session, type SessionFlavor } from "grammy";
import dotenv from "dotenv";
import mongoose from "mongoose";
import * as viem from "viem"
import { sendToken } from "./blockchain/sendToken";
import { Tokens } from "./lib/tokens";
import { getTokenBalance } from "./blockchain/getBalance";
import { type PaymentPayload, PaymentStatus, PaymentStep, type SessionData } from "./lib/types";
import { PreCheckoutError } from "./lib/CustomErrors";
import { SupportedChains, CHAIN_CONFIG } from "./lib/chains";
import { formatEther, parseEther } from "viem";
import { InsufficientVaultBalanceError } from "./lib/CustomErrors";
import { EXCHANGE_SUMMARY, INSUFFICIENT_VAULT_BALANCE, LOADING_STATE, SUCCESSFUL_EXCHANGE } from "./lib/links";
import { calculateTransactionBreakdown, FEES } from "./lib/fees";

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

// Bundle options (amount in USD)
const BUNDLES = [
    { amount: 0.015, stars: 1 },
    { amount: 0.75, stars: 50 },
    { amount: 3.75, stars: 250 },
    { amount: 7.5, stars: 500 }
];

// Set bot commands
await bot.api.setMyCommands([
    { command: "start", description: "Start the bot" },
    { command: "help", description: "Show help text" },
    { command: "buy", description: "Buy tokens with stars" },
    { command: "history", description: "View Payment history" },
    { command: "wallet", description: "View your wallet address" },
    { command: "addwallet", description: "Add or update wallet address" },
    { command: "removewallet", description: "Remove your wallet address" },
    { command: "simulate", description: "Test the payment flow (simulation)" }
]);

// Start command
bot.command("start", async (ctx) => {
    const user = await User.findOne({ chatId: ctx.chat.id });
    if (!user) {
        await User.create({ chatId: ctx.chat.id });
    }

    await ctx.replyWithPhoto(new InputFile("./assets/star-bridge-bright.webp"), {
        caption: "Welcome to Star Bridge! ⭐\n\n" +
        "Convert your Telegram Stars into crypto instantly!\n\n" +
        "Quick Start:\n" +
        "• /buy - Convert Stars to crypto\n" +
        "• /wallet - Set up your crypto wallet\n" +
        "• /history - View your conversion history\n\n" +
        "Need help? Use /help for more information."
    })

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
        `Your current wallet address is: \`${user.walletAddress}\`\n\n` +
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
        `✅ Wallet address ${user?.walletAddress ? 'updated' : 'set'} to: \`${address}\``,
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

const STAR_TO_USD_RATE = FEES.baseRate; // $0.013 per star

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
            `Base Amount: \\$${breakdown.originalAmount.toFixed(2)}\n` +
            `Fees Breakdown:\n` +
            `• Operational Fee: \\$${breakdown.operationalFee.toFixed(2)}\n` +
            `• Service Fee: \\$${breakdown.percentageFee.toFixed(2)} ` +
            `\\(${breakdown.originalAmount >= 500 ? '1' : '2'}%\\)\n\n` +
            `*Net Amount: \\$${breakdown.netAmount.toFixed(2)}*\n\n` +
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
        const requiredAmount = parseEther(payload.amountInToken.toFixed(2));

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
                `*Network:* _${SUPPORTED_CHAINS[payload.chain]}_\n` +
                `*Destination:* _${payload.walletAddress.replace(/[._-]/g, '\\$&')}_\n\n` +
                `*Token:* _${payload.token}_\n` +
                `*Amount:* _${payload.amountInToken.toFixed(2).replace('.', '\\.')} ${payload.token}_\n` +
                `*Stars:* _${payload.stars}_ ⭐\n` +
                `*USD Value:* _\\$${payload.amountInUSD.toFixed(2).replace('.', '\\.')}_\n` +
                `*Status:* _Awaiting Payment_\n` +
                `To bridge your tokens, please send *${payload.stars} stars*`,
            parse_mode: "MarkdownV2"
        });

        ctx.session.step = PaymentStep.PAYMENT_PENDING;

        await bot.api.sendInvoice(
            payload.chatId,
            `${payload.token} Payment`,
            `Payment of $${payload.amountInUSD.toFixed(3)} ${payload.token} on ${payload.chain}`,
            JSON.stringify(payload),
            process.env.PROVIDER_TOKEN!,
            [{label: "Confirm", amount: payload.stars}]
        );

    } catch (error) {
        console.error('Payment initiation error:', error);
        
        let errorMessage = "⚠️ *Payment Failed*\n\n";
        let animation;
        
        if (error instanceof InsufficientVaultBalanceError) {
            animation = INSUFFICIENT_VAULT_BALANCE
            errorMessage += `❌ *Insufficient Vault Balance*\n\n` +
                `Chain: ${error.chain.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}\n` +
                `Token: ${error.token.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}\n` +
                `Required: ${error.required.toString().replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')} ${error.token}\n` +
                `Available: ${error.available.toString().replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')} ${error.token}`;
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
            await ctx.editMessageText(errorMessage, { parse_mode: "MarkdownV2" });
        }
    }
});

bot.on("pre_checkout_query", async(ctx) => {
    try {
        const payload = JSON.parse(ctx.preCheckoutQuery.invoice_payload) as PaymentPayload;

        if (payload.stars !== ctx.preCheckoutQuery.total_amount) {
            throw new PreCheckoutError("Stars amount mismatch");
        }

        const vaultBalance = await getTokenBalance(payload.chain, payload.token);
        const requiredAmount = parseEther(payload.amountInToken.toFixed(2));

        if (vaultBalance < requiredAmount) {
            throw new InsufficientVaultBalanceError(
                payload.token,
                Number(requiredAmount),
                Number(vaultBalance),
                payload.chain
            );
        }

        payload.status = PaymentStatus.PROCESSING;
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
        } else {
            await ctx.answerPreCheckoutQuery(false, "An error occurred");
        }
    }
});

// Update successful payment handler
bot.on("message:successful_payment", async (ctx) => {
    if (!ctx.message?.successful_payment || !ctx.from || !ctx.session.currentPaymentId) {
        return;
    }
    const loadingState = await ctx.replyWithAnimation(LOADING_STATE);

    try {

        const payment = await Payment.findById(ctx.session.currentPaymentId);
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
            `✅ *Test Payment Successful\\!*\n\n` +
            `Transaction Hash: \`${tx.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}\`\n\n` +
            `${CHAIN_CONFIG[payment.chain as SupportedChains].explorer.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}/tx/${tx.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}`,
            { parse_mode: "MarkdownV2" }
        );

    } catch (error) {
        console.error('Payment processing error:', error);
        await ctx.api.deleteMessage(ctx.chat.id, loadingState.message_id);

        await ctx.reply("⚠️ There was an error processing your payment. Our team has been notified.");
        
        // Update payment status to failed
        await Payment.findByIdAndUpdate(ctx.session.currentPaymentId, {
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

// History command
bot.command("history", async (ctx) => {
    const payments = await Payment.find({ chatId: ctx.chat.id });

    if (!payments?.length) {
        return ctx.reply("You haven't made any Payments yet.");
    }

    const history = payments
        .map((Payment, i) =>
            `${i + 1}. ${Payment.amountInToken} ${Payment.token} on ${Payment.chain}\n` +
            `   Stars: ${Payment.stars} ⭐\n` +
            `   Status: ${Payment.status}\n` +
            `   Date: ${Payment.completionTimestamp?.toLocaleDateString()}`
        )
        .join('\n\n');

    await ctx.reply(`Payment History:\n\n${history}`);
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

// Add this new test command handler
bot.command("simulate", async (ctx) => {
    const user = await User.findOne({ chatId: ctx.chat.id });

    if (!user?.walletAddress) {
        return ctx.reply(
            "⚠️ Wallet Setup Required\n\n" +
            "Before testing, please set up your wallet using /addwallet"
        );
    }

    const starsArg = ctx.match;
    if (!starsArg) {
        return ctx.reply(
            "Please specify the number of stars:\n" +
            "/simulate <number_of_stars>\n\n" +
            `Example: /simulate ${Math.ceil(FEES.minimumTx / FEES.baseRate)} (minimum amount)`
        );
    }

    const stars = parseInt(starsArg);
    if (isNaN(stars) || stars <= 0) {
        return ctx.reply("Please enter a valid number of stars.");
    }

    try {
        const breakdown = calculateTransactionBreakdown(stars);

        // Simulate a payment
        const simulatedPayload: PaymentPayload = {
            chatId: ctx.chat.id,
            walletAddress: user.walletAddress,
            chain: SupportedChains.OPBNB,
            token: Tokens.USDT,
            stars: stars,
            amountInToken: breakdown.netAmount,
            amountInUSD: breakdown.netAmount,
            operationalFee: breakdown.operationalFee,
            serviceFee: breakdown.percentageFee,
            totalFees: breakdown.totalFees,
            creationTimestamp: Date.now(),
            status: PaymentStatus.PENDING,
            telegramPaymentChargeId: 'test-payment-' + Date.now(),
            transactionId: ''
        };

        // Create payment record in DB
        const payment = await Payment.create(simulatedPayload);

        await ctx.reply(
            "🧪 *TEST MODE: Simulating payment flow*\n\n" +
            `Converting ${stars} Stars\n\n` +
            `Base Amount: \\$${breakdown.originalAmount.toFixed(2)}\n` +
            `Fees Breakdown:\n` +
            `• Operational Fee: \\$${breakdown.operationalFee.toFixed(2)}\n` +
            `• Service Fee: \\$${breakdown.percentageFee.toFixed(2)} ` +
            `\\(${breakdown.originalAmount >= 500 ? '1' : '2'}%\\)\n\n` +
            `*Net Amount: \\$${breakdown.netAmount.toFixed(2)}*`,
            { parse_mode: "MarkdownV2" }
        );

        const loadingState = await ctx.replyWithAnimation(LOADING_STATE);

        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
            // Check vault balance first
            const vaultBalance = await getTokenBalance(simulatedPayload.chain, simulatedPayload.token);
            const requiredAmount = parseEther(simulatedPayload.amountInToken.toFixed(2));

            if (vaultBalance < requiredAmount) {
                throw new InsufficientVaultBalanceError(
                    simulatedPayload.token,
                    Number(formatEther(requiredAmount)),
                    Number(formatEther(vaultBalance)),
                    simulatedPayload.chain
                );
            }

            // Process the token transfer
            const tx = await sendToken(
                simulatedPayload.walletAddress as `0x${string}`,
                simulatedPayload.chain,
                simulatedPayload.token,
                simulatedPayload.amountInToken
            );

            // Update payment status
            await Payment.findByIdAndUpdate(payment._id, {
                status: PaymentStatus.COMPLETED,
                transactionId: tx,
                completionTimestamp: new Date()
            });

            await ctx.api.editMessageMedia(loadingState.chat.id, loadingState.message_id, {
                type: "animation",
                media: SUCCESSFUL_EXCHANGE
            });

            await ctx.reply(
                `✅ *Test Payment Successful\\!*\n\n` +
                `Transaction Hash: \`${tx.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}\`\n\n` +
                `Profit earned: \\$${(breakdown.totalFees).toFixed(2)}\n\n` +
                `${CHAIN_CONFIG[simulatedPayload.chain].explorer.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}/tx/${tx.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}`,
                { parse_mode: "MarkdownV2" }
            );

        } catch (error) {
            console.error('Test payment processing error:', error);
            await ctx.api.deleteMessage(ctx.chat.id, loadingState.message_id);

            let errorMessage = "⚠️ *Test Payment Failed*\n\n";
            
            if (error instanceof InsufficientVaultBalanceError) {
                errorMessage += `❌ *Insufficient Vault Balance*\n\n` +
                    `Chain: ${error.chain.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}\n` +
                    `Token: ${error.token.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}\n` +
                    `Required: ${error.required.toString().replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')} ${error.token}\n` +
                    `Available: ${error.available.toString().replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')} ${error.token}`;
            } else {
                errorMessage += "There was an error processing your test payment\\.";
            }
            
            await ctx.reply(errorMessage, { parse_mode: "MarkdownV2" });
            
            // Update payment status to failed
            await Payment.findByIdAndUpdate(payment._id, {
                status: PaymentStatus.FAILED,
                completionTimestamp: new Date()
            });
        }
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

// Start the bot
bot.start();