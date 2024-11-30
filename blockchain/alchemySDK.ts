import { Alchemy, Network } from "alchemy-sdk";
import dotenv from "dotenv";

dotenv.config();

export default function createAlchemySDK_Internal(chain: string) {
    const TESTNET = process.env.TESTNET === "true";
    const ALCHEMY_KEY = process.env.ALCHEMY_KEY;
    let network: Network;
    
    if(chain === "bsc"){
        network = TESTNET ? Network.BNB_TESTNET : Network.BNB_MAINNET
    }else if(chain === "op_bnb"){
        network = TESTNET ? Network.OPBNB_TESTNET : Network.OPBNB_MAINNET
    }else{
        throw new Error("Invalid chain")
    }
    
    const alchemy = new Alchemy({
        apiKey: ALCHEMY_KEY,
        network: network,
    });

    return alchemy;
}
