import { createClient, createPublicClient, createWalletClient, http, type Chain, type HttpTransport } from "viem";
import { bsc, bscTestnet, opBNB, opBNBTestnet } from "viem/chains";
import { getNetworkHttp } from "../lib/networkHelpers";
import dotenv from "dotenv";
import { privateKeyToAccount } from "viem/accounts";
import { SupportedChains } from "../lib/chains";

dotenv.config();


export default function createClient_Internal(chain: SupportedChains) {
    const TESTNET = process.env.TESTNET === "true";
    const ADMIN_WALLET_PRIVATE_KEY = process.env.ADMIN_WALLET_PRIVATE_KEY;

    if(!ADMIN_WALLET_PRIVATE_KEY)
        throw new Error("ADMIN_WALLET_PRIVATE_KEY not found in environment variables");

    let transportHTTPUrl: string
    let clientChain: Chain;

    if(chain === SupportedChains.BSC) {
        clientChain = TESTNET ? bscTestnet : bsc

        transportHTTPUrl = TESTNET ? getNetworkHttp(bscTestnet) : getNetworkHttp(bsc)
        
    }else if(chain === SupportedChains.OPBNB) {
        clientChain = TESTNET ? opBNBTestnet : opBNB

        transportHTTPUrl = TESTNET ? getNetworkHttp(opBNBTestnet) : getNetworkHttp(opBNB)        
    }else{
        throw new Error("Invalid chain")
    }


    const account = privateKeyToAccount(`0x${ADMIN_WALLET_PRIVATE_KEY}`);

    const client = createPublicClient({
        transport: http(transportHTTPUrl),
        chain: clientChain
    })

    const walletClient = createWalletClient({
        account,
        transport: http(transportHTTPUrl),
        chain: clientChain
    })

    return {client, walletClient, clientChain};
}