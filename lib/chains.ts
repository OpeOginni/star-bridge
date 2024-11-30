export enum Chain {
    BSC = "BSC",
    OPBNB = "opBNB"
}

export const CHAIN_NAMES: Record<Chain, string> = {
    [Chain.BSC]: "Binance Smart Chain",
    [Chain.OPBNB]: "opBNB"
} as const;

// For network-specific configurations
export const CHAIN_IDS: Record<Chain, number> = {
    [Chain.BSC]: 56,
    [Chain.OPBNB]: 204
} as const;

// For RPC endpoints, explorers etc.
export const CHAIN_CONFIG: Record<Chain, {
    rpc: string;
    explorer: string;
    name: string;
}> = {
    [Chain.BSC]: {
        rpc: "https://bsc-dataseed.binance.org",
        explorer: "https://bscscan.com",
        name: CHAIN_NAMES[Chain.BSC]
    },
    [Chain.OPBNB]: {
        rpc: "https://opbnb-mainnet-rpc.bnbchain.org",
        explorer: "https://opbnb.bscscan.com",
        name: CHAIN_NAMES[Chain.OPBNB]
    }
} as const;