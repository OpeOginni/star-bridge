import { Tokens } from "../../lib/tokens";
import { bsc, bscTestnet, opBNB, opBNBTestnet } from "viem/chains"
import { VAULT_CONTRACTS } from "../../lib/vaultContracts";

export const HARDHAT_VAULT_CONTRACTS_MAP: {[key: string]: `0x${string}`} = {
        bsc : VAULT_CONTRACTS[bsc.name],
        bscTestnet : VAULT_CONTRACTS[bscTestnet.name],
        opBNB: VAULT_CONTRACTS[opBNB.name],
        opBNBTestnet: VAULT_CONTRACTS[opBNBTestnet.name],
}