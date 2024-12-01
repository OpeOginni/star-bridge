import dotenv from "dotenv";
import createClient_Internal from "./client";
import createAlchemySDK_Internal from "./alchemySDK";
import { TOKENS_MAP, type Tokens } from "../lib/tokens";
import { ERC20_ABI } from "../lib/ABIs";

dotenv.config();

export async function getVaultBalance(chain: string, token: Tokens) {
    const {clientChain} = createClient_Internal(chain);
    const alchemySDK = createAlchemySDK_Internal(chain);
    const VAULT_WALLET_ADDRESS = process.env.VAULT_WALLET_ADDRESS;
    if (!VAULT_WALLET_ADDRESS) 
        throw new Error("VAULT_WALLET_ADDRESS not found in environment variables");
    

    const tokenAddress = TOKENS_MAP[token][clientChain.name as keyof (typeof TOKENS_MAP)[typeof token]] as `0x${string}`;
    if(!tokenAddress) 
        throw new Error("Token address not found");
    
    const balance = await alchemySDK.core.getTokenBalances(VAULT_WALLET_ADDRESS, [tokenAddress]);

    return balance.tokenBalances[0]?.tokenBalance ?? "0";
}