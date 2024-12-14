import {  parseEther } from "viem";
import dotenv from "dotenv";
import createClient_Internal from "./client";
import { StarBridgeVaultABI } from "../lib/ABIs";
import { getNativeBalance } from "./getBalance";
import { VAULT_CONTRACTS } from "../lib/vaultContracts";
import { ethers } from "hardhat";
import type { SupportedChains } from "../lib/chains";

dotenv.config();

export async function sendNative(walletAddress: `0x${string}`, chain: SupportedChains, amountInEther: bigint) {
    const {walletClient, clientChain} = createClient_Internal(chain);

    const VaultContractAddress = VAULT_CONTRACTS[clientChain.name];

    if (!VaultContractAddress || VaultContractAddress === "0x") 
        throw new Error("VaultContractAddress not set");
    
    const balanceInWei = await getNativeBalance(chain);

    const amountInWei = parseEther(amountInEther.toString());
   
    if(balanceInWei < amountInWei)
        throw new Error("Insufficient Vault balance");

    const zeroAddress = ethers.ZeroAddress as `0x${string}`;

    const tx = await walletClient.writeContract({
        address: VaultContractAddress,
        abi: StarBridgeVaultABI,
        functionName: "payout",
        args: [zeroAddress, amountInWei, walletAddress]
    })

    return tx;
}