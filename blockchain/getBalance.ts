import createClient_Internal from "./client";
import { TOKENS_MAP, type Tokens } from "../lib/tokens";
import { ERC20_ABI } from "../lib/ABIs";
import { VAULT_CONTRACTS } from "../lib/vaultContracts";
import { ChainConfigurationError } from "../lib/CustomErrors";
import type { SupportedChains } from "../lib/chains";

export async function getTokenBalance(chain: SupportedChains, token: Tokens) {
    const {client, clientChain} = createClient_Internal(chain);
    
    const VaultContractAddress = VAULT_CONTRACTS[clientChain.name];
    const tokenAddress = TOKENS_MAP[token][clientChain.name];

    if (!VaultContractAddress || VaultContractAddress === "0x") 
        throw new Error("VaultContractAddress not set");

    if(!tokenAddress) 
        throw new Error("Token address not found");

    const balance = await client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [VaultContractAddress]
    })

    return balance;
}

export async function getNativeBalance(chain: SupportedChains) {
    const {client, clientChain} = createClient_Internal(chain);

    const VaultContractAddress = VAULT_CONTRACTS[clientChain.name];

    if (!VaultContractAddress || VaultContractAddress === "0x") 
        throw new ChainConfigurationError("VaultContractAddress not set");

    const balance = await client.getBalance({
        address: VaultContractAddress
    })

    return balance;
}