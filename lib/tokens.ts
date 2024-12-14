import { bsc, bscTestnet, opBNB, opBNBTestnet } from "viem/chains"

export enum Tokens {
    USDT = "USDT",
    USDC = "USDC"
}

export const TOKENS_MAP: {[key: string]: {[key: string]: `0x${string}`}} = {
    [Tokens.USDT]: {
        [bsc.name] : "0x55d398326f99059ff775485246999027b3197955",
        [bscTestnet.name] : "0xc8cf9bac05202a0e6527f2745d8d0adef7a6a8fe",
        [opBNB.name]: "0x9e5aac1ba1a2e6aed6b32689dfcf62a509ca96f3",
        [opBNBTestnet.name]: "0xcf712f20c85421d00eaa1b6f6545aaeeb4492b75",
    },
    [Tokens.USDC]: {
        [bsc.name] : "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
        [bscTestnet.name] : "0xb48249ef5b895d6e7ad398186df2b0c3cec2bf94",
    }
}