import type { Chain } from "viem";
import { bsc, bscTestnet, opBNB, opBNBTestnet } from "viem/chains";
import dotenv from "dotenv";

dotenv.config();

export const getNetworkHttp = (chain: Chain) => {
    const alchemyKey = process.env.ALCHEMY_API_KEY;

    if(chain ===  bscTestnet) 
        return `https://bnb-testnet.g.alchemy.com/v2/${alchemyKey}`

    if(chain === bsc)
        return `https://bsc-mainnet.g.alchemy.com/v2/${alchemyKey}`

    if(chain === opBNB)
        return `https://opbnb-mainnet.g.alchemy.com/v2/${alchemyKey}`

    if(chain === opBNBTestnet)
        return `https://opbnb-testnet.g.alchemy.com/v2/${alchemyKey}`

    throw new Error("Invalid chain")
}