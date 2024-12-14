import { bsc, bscTestnet, opBNB, opBNBTestnet } from "viem/chains"

export enum Tokens {
    USDT = "USDT",
    USDC = "USDC"
}

export const TOKENS_MAP: {[key: string]: {[key: string]: `0x${string}`}} = {
    [Tokens.USDT]: {
        [bsc.name] : "0x55d398326f99059ff775485246999027b3197955",
        [bscTestnet.name] : "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
        [opBNB.name]: "0x9e5aac1ba1a2e6aed6b32689dfcf62a509ca96f3",
        [opBNBTestnet.name]: "0xcf712f20c85421d00eaa1b6f6545aaeeb4492b75",
    },
    [Tokens.USDC]: {
        [bsc.name] : "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
        [bscTestnet.name] : "0x64544969ed7EBf5f083679233325356EbE738930",
    }
}