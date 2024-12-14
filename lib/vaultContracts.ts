import { bsc, bscTestnet, opBNB, opBNBTestnet } from "viem/chains"

export const VAULT_CONTRACTS: {[key: string]: `0x${string}`} = {
    [bsc.name] : "0x",
    [bscTestnet.name] : "0x45300386d7A051335c638480B20E9db93bc919E9", // https://testnet.bscscan.com/address/0x45300386d7A051335c638480B20E9db93bc919E9#code
    [opBNB.name]: "0x",
    [opBNBTestnet.name]: "0xD6e869136011388c5E863b859c1e407B7c4DC1e7",
}