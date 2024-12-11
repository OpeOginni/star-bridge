import dotenv from "dotenv";
import createClient_Internal from "./client";
import createAlchemySDK_Internal from "./alchemySDK";
import { TOKENS_MAP, type Tokens } from "../lib/tokens";
import { ERC20_ABI } from "../lib/ABIs";
import { VAULT_CONTRACTS } from "../lib/vaults";

dotenv.config();

export async function getVaultBalance(chain: string, token: Tokens) {
    const {client, clientChain} = createClient_Internal(chain);
    const VAULT_WALLET_ADDRESS = process.env.VAULT_WALLET_ADDRESS;
    if (!VAULT_WALLET_ADDRESS) 
        throw new Error("VAULT_WALLET_ADDRESS not found in environment variables");
    
    const VAULT_CONTRACT_ADDRESS = VAULT_CONTRACTS[clientChain.name]

    const tokenAddress = TOKENS_MAP[token][clientChain.name as keyof (typeof TOKENS_MAP)[typeof token]] as `0x${string}`;
    if(!tokenAddress) 
        throw new Error("Token address not found");

    const balance = await client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [VAULT_CONTRACT_ADDRESS]
    })
    

    return Number.parseFloat(balance.toString()) ?? 0;
}