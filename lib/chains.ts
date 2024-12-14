import dotenv from "dotenv";
dotenv.config();

const TESTNET = process.env.TESTNET === "true";

export enum SupportedChains {
    BSC = "BSC",
    OPBNB = "opBNB"
}

export const CHAIN_NAMES: Record<SupportedChains, string> = {
    [SupportedChains.BSC]: "Binance Smart Chain",
    [SupportedChains.OPBNB]: "opBNB"
} as const;

// For network-specific configurations
export const CHAIN_IDS: Record<SupportedChains, number> = {
    [SupportedChains.BSC]: 56,
    [SupportedChains.OPBNB]: 204
} as const;

// For RPC endpoints, explorers etc.
export const CHAIN_CONFIG: Record<SupportedChains, {
    rpc: string;
    explorer: string;
    name: string;
}> = {
    [SupportedChains.BSC]: {
        rpc: "https://bsc-dataseed.binance.org",
        explorer: TESTNET ? "https://testnet.bscscan.com" : "https://bscscan.com",
        name: CHAIN_NAMES[SupportedChains.BSC]
    },
    [SupportedChains.OPBNB]: {
        rpc: "https://opbnb-mainnet-rpc.bnbchain.org",
        explorer: TESTNET ? "https://opbnb-testnet.bscscan.com" : "https://opbnb.bscscan.com",
        name: CHAIN_NAMES[SupportedChains.OPBNB]
    }
} as const;