import { bsc, bscTestnet, opBNB, opBNBTestnet } from "viem/chains"

export const VAULT_CONTRACTS: {[key: string]: `0x${string}`} = {
    [bsc.name] : "0x",
    [bscTestnet.name] : "0x",
    [opBNB.name]: "0x",
    [opBNBTestnet.name]: "0x",
}