import { Bot, Context, InlineKeyboard, session, type SessionFlavor } from "grammy";
import dotenv from "dotenv";
import mongoose from "mongoose";
import * as viem from "viem"
import { sendToken } from "./blockchain/sendToken";
import { Tokens } from "./lib/tokens";
import { getVaultBalance } from "./blockchain/getVaultBalance";
import { type PaymentPayload, PaymentStatus, PaymentStep, type SessionData } from "./lib/types";
import { PreCheckoutError } from "./lib/CustomErrors";
import { Chain, CHAIN_CONFIG } from "./lib/chains";

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
const SUPPORTED_CHAINS = {
    [Chain.BSC]: "Binance Smart Chain",
    [Chain.OPBNB]: "opBNB"
};

const SUPPORTED_TOKENS = {
    [Chain.BSC]: [Tokens.USDT, Tokens.USDC],
    [Chain.OPBNB]: [Tokens.USDT]
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
    { command: "removewallet", description: "Remove your wallet address" }
]);

// Start command
bot.command("start", async (ctx) => {
    const user = await User.findOne({ chatId: ctx.chat.id });
    if (!user) {
        await User.create({ chatId: ctx.chat.id });
    }
    await ctx.reply(
        "Welcome to Star Bridge! ⭐\n\n" +
        "Convert your Telegram Stars into crypto instantly!\n\n" +
        "Quick Start:\n" +
        "• /buy - Convert Stars to crypto\n" +
        "• /wallet - Set up your crypto wallet\n" +
        "• /history - View your conversion history\n\n" +
        "Need help? Use /help for more information."
    );
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

// Buy command
bot.command("buy", async (ctx) => {
    const user = await User.findOne({ chatId: ctx.chat.id });

    if (!user?.walletAddress) {
        return ctx.reply(
            "⚠️ Wallet Setup Required\n\n" +
            "Before converting your Stars to crypto, please set up your wallet using /addwallet"
        );
    }

    // Create chain selection keyboard
    const keyboard = new InlineKeyboard();
    Object.entries(SUPPORTED_CHAINS).forEach(([key, name]) => {
        keyboard.text(name, `chain_${key}`).row();
    });

    ctx.session.walletAddress = user.walletAddress;

    await ctx.reply("Select which blockchain you'd like to receive your crypto on:", { reply_markup: keyboard });
});

// Handle chain selection
bot.callbackQuery(/^chain_(.+)$/, async (ctx) => {
    console.log(ctx.update.callback_query.data)
    const chain = ctx.match[1]

    ctx.session.selectedChain = chain as Chain;

    // Create token selection keyboard
    const keyboard = new InlineKeyboard();
    SUPPORTED_TOKENS[chain as keyof typeof SUPPORTED_TOKENS].forEach((token: string) => {
        keyboard.text(token, `token_${token}`).row();
    });

    await ctx.editMessageText("Select token:", { reply_markup: keyboard });
});

// Handle token selection
bot.callbackQuery(/^token_(.+)$/, async (ctx) => {
    console.log(ctx.session)
    console.log(ctx.match)
    const token = ctx.match[1];
    ctx.session.selectedToken = token as Tokens;

    // Create bundles keyboard
    const keyboard = new InlineKeyboard();
    BUNDLES.forEach(bundle => {
        keyboard.text(
            `$${bundle.amount} (${bundle.stars} ⭐)`,
            `bundle_${bundle.amount}`
        ).row();
    });

    await ctx.editMessageText(
        `Select bundle for ${token} on ${SUPPORTED_CHAINS[ctx.session.selectedChain as keyof typeof SUPPORTED_CHAINS]}:`,
        { reply_markup: keyboard }
    );
});

// Handle bundle selection
bot.callbackQuery(/^bundle_(.+)$/, async (ctx) => {
    const amount = Number(ctx.match[1]);
    const bundle = BUNDLES.find(b => b.amount === amount);

    if (!bundle) return;

    const payload: PaymentPayload = {
        chatId: ctx.chat!.id,
        walletAddress: ctx.session.walletAddress,
        chain: ctx.session.selectedChain!,
        token: ctx.session.selectedToken!,
        stars: bundle.stars,
        amountInToken: bundle.amount,
        amountInUSD: bundle.amount,
        creationTimestamp: Date.now(),
        status: PaymentStatus.PENDING,
        telegramPaymentChargeId: '', // Will be updated after invoice creation
        transactionId: '' // Will be filled when transaction is sent
    };

    // Create payment record in DB
    const payment = await Payment.create(payload);

    await ctx.editMessageText(
        `🌉 Star Bridge Exchange Summary\n\n` +
        `Network: ${SUPPORTED_CHAINS[payload.chain]}\n` +
        `Token: ${payload.token}\n` +
        `Amount: ${payload.amountInToken} ${payload.token}\n` +
        `Stars Required: ${payload.stars} ⭐\n` +
        `Destination: ${payload.walletAddress}\n\n` +
        `Status: Awaiting Payment\n` +
        `To bridge your tokens, please send ${payload.stars} stars.`
    );

    ctx.session.currentPaymentId = payment._id;
    ctx.session.step = PaymentStep.PAYMENT_PENDING;

    await bot.api.sendInvoice(
        payload.chatId,
        `${payload.token} Payment`,
        `Payment of $${payload.amountInUSD} ${payload.token} on ${payload.chain}`,
        "{}",
        "XTR",
        [{label: "Confirm", amount: payload.stars}]
    );
});

bot.on("pre_checkout_query", async(ctx) => {
    try{
        const payload = JSON.parse(ctx.preCheckoutQuery.invoice_payload) as PaymentPayload;

        if (payload.stars !== ctx.preCheckoutQuery.total_amount) {
            throw new PreCheckoutError("Stars amount mismatch");
        }

        const vaultBalance = await getVaultBalance(payload.chain, payload.token);
        if (vaultBalance < payload.amountInToken) {
            throw new PreCheckoutError("Insufficient vault balance");
        }

        payload.status = PaymentStatus.PROCESSING;

        await ctx.answerPreCheckoutQuery(true);

    }catch(error){
        if(error instanceof PreCheckoutError){
            await ctx.answerPreCheckoutQuery(false, error.message);
        }else{
            await ctx.answerPreCheckoutQuery(false, "An error occurred");
        }
    }
  });

// Update successful payment handler
bot.on("message:successful_payment", async (ctx) => {
    if (!ctx.message?.successful_payment || !ctx.from || !ctx.session.currentPaymentId) {
        return;
    }

    try {
        const payment = await Payment.findById(ctx.session.currentPaymentId);
        if (!payment) {
            throw new Error('Payment not found');
        }
        
        // Process the token transfer
        const tx = await sendToken(
            payment.walletAddress as `0x${string}`,
            payment.chain as Chain,
            payment.token as Tokens,
            payment.amountInToken
        );

        // Update payment status
        await Payment.findByIdAndUpdate(payment._id, {
            status: PaymentStatus.COMPLETED,
            transactionId: tx,
            telegramPaymentChargeId: ctx.message.successful_payment.provider_payment_charge_id
        });

        await ctx.reply(
            `✅ Payment Successful!\n\n` +
            `Transaction Hash: \`${tx}\`\n` +
            `View on Explorer: ${CHAIN_CONFIG[payment.chain as Chain].explorer}/tx/${tx}`,
            { parse_mode: "MarkdownV2" }
        );

    } catch (error) {
        console.error('Payment processing error:', error);
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

// Start the bot
bot.start();