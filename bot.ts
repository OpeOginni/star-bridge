import { Bot, Context, InlineKeyboard, session, type SessionFlavor } from "grammy";
import dotenv from "dotenv";
import * as ethers from "ethers";
import mongoose from "mongoose";
import * as viem from "viem"
import { sendToken } from "./blockchain/sendToken";
import { Tokens } from "./lib/tokens";

dotenv.config();

// Define interfaces
interface UserData {
    chatId: number;
    walletAddress?: string;
    purchaseHistory: {
        token: string;
        chain: string;
        amount: number;
        stars: number;
        date: Date;
    }[];
}

// Define mongoose schema
const userSchema = new mongoose.Schema({
    chatId: { type: Number, required: true, unique: true },
    walletAddress: String,
    purchaseHistory: [{
        token: String,
        chain: String,
        amount: Number,
        stars: Number,
        date: { type: Date, default: Date.now }
    }]
});

const User = mongoose.model('User', userSchema);

interface SessionData {
    step: string;
    walletAddress: string;
    selectedChain: string;
    selectedToken: Tokens | "";
}

// Custom context type
type MyContext = Context & SessionFlavor<SessionData>;

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

function initial(): SessionData {
    return {
        step: "",
        walletAddress: "",
        selectedChain: "",
        selectedToken: "",
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
    "BSC": "Binance Smart Chain",
    "opBNB": "opBNB"
};

const SUPPORTED_TOKENS = {
    "BSC": [Tokens.USDT, Tokens.USDC],
    "opBNB": [Tokens.USDT]
};

// Bundle options (amount in USD)
const BUNDLES = [
    { amount: 10, stars: 1000 },
    { amount: 50, stars: 5500 },
    { amount: 100, stars: 12000 }
];

// Set bot commands
await bot.api.setMyCommands([
    { command: "start", description: "Start the bot" },
    { command: "help", description: "Show help text" },
    { command: "buy", description: "Buy tokens with stars" },
    { command: "history", description: "View purchase history" },
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

    ctx.session.selectedChain = chain;

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
    console.log(ctx.session)
    const amount = Number(ctx.match[1]);
    const bundle = BUNDLES.find(b => b.amount === amount);

    if (!bundle) return;

    const payload = {chatId: ctx.chatId, walletAddress: ctx.session.walletAddress, chain: ctx.session.selectedChain, token: ctx.session.selectedToken, stars: bundle.stars}
    await ctx.editMessageText(
        `🌉 Star Bridge Exchange Summary\n\n` +
        `Token: ${ctx.session.selectedToken}\n` +
        `Network: ${SUPPORTED_CHAINS[ctx.session.selectedChain as keyof typeof SUPPORTED_CHAINS]}\n` +
        `Amount: $${amount}\n` +
        `Stars Required: ${bundle.stars} ⭐\n` +
        `Destination: ${ctx.session.walletAddress}\n\n` +
        `To bridge your tokens, please send ${bundle.stars} stars.`
    );

    await bot.api.sendInvoice(ctx.chatId!, `${ctx.session.selectedToken} Purchase`, `Purchase of ${bundle.amount}${ctx.session.selectedToken} on ${ctx.session.selectedChain}`, JSON.stringify(payload), "XTR", [{label: "Confirm", amount: bundle.stars}])

    console.log("Completed Purchase")
    // await sendToken(ctx.session.walletAddress as `0x${string}`, ctx.session.selectedChain, ctx.session.selectedToken as Tokens, bundle.amount);
    // Here you would implement the actual purchase logic

});

// History command
bot.command("history", async (ctx) => {
    const user = await User.findOne({ chatId: ctx.chat.id });

    if (!user?.purchaseHistory?.length) {
        return ctx.reply("You haven't made any purchases yet.");
    }

    const history = user.purchaseHistory
        .map((purchase, i) =>
            `${i + 1}. ${purchase.amount} ${purchase.token} on ${purchase.chain}\n` +
            `   Stars: ${purchase.stars} ⭐\n` +
            `   Date: ${purchase.date.toLocaleDateString()}`
        )
        .join('\n\n');

    await ctx.reply(`Purchase History:\n\n${history}`);
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