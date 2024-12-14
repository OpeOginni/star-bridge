import hre from "hardhat";
import { Tokens } from "../../lib/tokens";
import { HARDHAT_TOKENS_MAP } from "../constants/tokens";

const VAULT_CONTRACT_ADDRESS = "";

const main = async (token: Tokens) => {
    const TOKEN_CONTRACT_ADDRESS = HARDHAT_TOKENS_MAP[token][hre.network.name];       
    if(!TOKEN_CONTRACT_ADDRESS) 
        throw new Error(`Token ${token} not supported on ${hre.network.name}`);

    const vaultContract = await hre.ethers.getContractAt("StarBridgeVault", VAULT_CONTRACT_ADDRESS);

    const tx = await vaultContract.removeAcceptedToken(TOKEN_CONTRACT_ADDRESS)
    await tx.wait();

    console.log(`Removed ${token} with address ${TOKEN_CONTRACT_ADDRESS} from the accepted tokens`);
    console.log(`Transaction hash: ${tx.hash}`);
}

main(Tokens.USDT);