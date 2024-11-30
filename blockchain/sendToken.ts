import { createPublicClient, http, type Chain, type HttpTransport, parseEther } from "viem";
import { bsc, bscTestnet, opBNB, opBNBTestnet } from "viem/chains";
import { getNetworkHttp } from "../lib/networkHelpers";
import dotenv from "dotenv";
import createClient_Internal from "./client";
import createAlchemySDK_Internal from "./alchemySDK";
import { TOKENS_MAP, type Tokens } from "../lib/tokens";
import { ERC20_ABI } from "../lib/ABIs";

dotenv.config();

export async function sendToken(walletAddress: `0x${string}`, chain: string, token: Tokens, amount: number) {
    const {client, walletClient, clientChain} = createClient_Internal(chain);
    const alchemySDK = createAlchemySDK_Internal(chain);
    const VAULT_WALLET_ADDRESS = process.env.VAULT_WALLET_ADDRESS;
    if (!VAULT_WALLET_ADDRESS) 
        throw new Error("VAULT_WALLET_ADDRESS not found in environment variables");
    

    const tokenAddress = TOKENS_MAP[token][clientChain.name as keyof (typeof TOKENS_MAP)[typeof token]] as `0x${string}`;
    if(!tokenAddress) 
        throw new Error("Token address not found");
    
    const balance = await alchemySDK.core.getTokenBalances(VAULT_WALLET_ADDRESS, [tokenAddress]);

    if(Number.parseFloat(balance.tokenBalances[0]?.tokenBalance ?? "0") < amount)
        throw new Error("Insufficient Vault balance");

    const tx = await walletClient.writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [walletAddress, parseEther(amount.toString())]
    })

    return tx;
}