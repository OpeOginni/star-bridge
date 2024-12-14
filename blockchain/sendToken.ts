import { parseEther } from "viem";
import dotenv from "dotenv";
import createClient_Internal from "./client";
import { TOKENS_MAP, type Tokens } from "../lib/tokens";
import { StarBridgeVaultABI } from "../lib/ABIs";
import { getTokenBalance } from "./getBalance";
import { VAULT_CONTRACTS } from "../lib/vaultContracts";
import { ChainConfigurationError } from "../lib/CustomErrors";
import type { SupportedChains } from "../lib/chains";

dotenv.config();

export async function sendToken(walletAddress: `0x${string}`, chain: SupportedChains, token: Tokens, amountInEther: number) {
    const {walletClient, clientChain} = createClient_Internal(chain);

    const VaultContractAddress = VAULT_CONTRACTS[clientChain.name];
    const tokenAddress = TOKENS_MAP[token][clientChain.name];

    if (!VaultContractAddress || VaultContractAddress === "0x") 
        throw new ChainConfigurationError("VaultContractAddress not set");

    if(!tokenAddress) 
        throw new ChainConfigurationError("VaultContractAddress not set");
    
    const balanceInWei = await getTokenBalance(chain, token);

    const amountInWei = parseEther(amountInEther.toFixed(2));
   
    if(balanceInWei < amountInWei)
        throw new Error("Insufficient Vault balance");

    const tx = await walletClient.writeContract({
        address: VaultContractAddress,
        abi: StarBridgeVaultABI,
        functionName: "payout",
        args: [tokenAddress, amountInWei, walletAddress]
    })

    return tx;
}