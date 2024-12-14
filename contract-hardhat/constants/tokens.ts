import { Tokens } from "../../lib/tokens";
import { bsc, bscTestnet, opBNB, opBNBTestnet } from "viem/chains"
import { TOKENS_MAP } from "../../lib/tokens";

export const HARDHAT_TOKENS_MAP = {
    [Tokens.USDT]: {
        bsc : TOKENS_MAP[Tokens.USDT][bsc.name],
        bscTestnet : TOKENS_MAP[Tokens.USDT][bscTestnet.name],
        opBNB: TOKENS_MAP[Tokens.USDT][opBNB.name],
        opBNBTestnet: TOKENS_MAP[Tokens.USDT][opBNBTestnet.name],
    },
    [Tokens.USDC]: {
        bsc : TOKENS_MAP[Tokens.USDC][bsc.name],
        bscTestnet : TOKENS_MAP[Tokens.USDC][bscTestnet.name],
    }
}