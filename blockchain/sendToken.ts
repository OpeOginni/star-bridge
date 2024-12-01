import { parseEther } from "viem";
import dotenv from "dotenv";
import createClient_Internal from "./client";
import { TOKENS_MAP, type Tokens } from "../lib/tokens";
import { ERC20_ABI } from "../lib/ABIs";
import { getVaultBalance } from "./getVaultBalance";

dotenv.config();

export async function sendToken(walletAddress: `0x${string}`, chain: string, token: Tokens, amount: number) {
    const {client, walletClient, clientChain} = createClient_Internal(chain);
    const VAULT_WALLET_ADDRESS = process.env.VAULT_WALLET_ADDRESS;
    if (!VAULT_WALLET_ADDRESS) 
        throw new Error("VAULT_WALLET_ADDRESS not found in environment variables");
    

    const tokenAddress = TOKENS_MAP[token][clientChain.name as keyof (typeof TOKENS_MAP)[typeof token]] as `0x${string}`;
    if(!tokenAddress) 
        throw new Error("Token address not found");
    
    const balance = await getVaultBalance(chain, token);

    if(Number.parseFloat(balance) < amount)
        throw new Error("Insufficient Vault balance");

    const tx = await walletClient.writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [walletAddress, parseEther(amount.toString())]
    })

    return tx;
}