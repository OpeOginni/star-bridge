import hre from "hardhat";
import { Tokens } from "../../lib/tokens";
import { HARDHAT_TOKENS_MAP } from "../constants/tokens";
import { HARDHAT_VAULT_CONTRACTS_MAP } from "../constants/vaultContracts";


const main = async (amount: number, token: Tokens | "native") => {
    const VAULT_CONTRACT_ADDRESS = HARDHAT_VAULT_CONTRACTS_MAP[hre.network.name];
    if(!VAULT_CONTRACT_ADDRESS || VAULT_CONTRACT_ADDRESS === "0x")
        throw new Error(`Vault contract not found for ${hre.network.name}`);

    if (token === "native") {
        const [mainAccount] = await hre.ethers.getSigners();
        const tx = await mainAccount.sendTransaction({
            to: VAULT_CONTRACT_ADDRESS,
            value: hre.ethers.parseEther(amount.toString())
        })
        await tx.wait();

        console.log(`Deposited ${amount} BNB to the vault`);
        console.log(`Transaction hash: ${tx.hash}`);
        return;
    } else {
        const TOKEN_CONTRACT_ADDRESS = HARDHAT_TOKENS_MAP[token][hre.network.name];       
        if(!TOKEN_CONTRACT_ADDRESS) 
            throw new Error(`Token ${token} not supported on ${hre.network.name}`);
        
        const vaultContract = await hre.ethers.getContractAt("StarBridgeVault", VAULT_CONTRACT_ADDRESS);
        const tokenContract = await hre.ethers.getContractAt("IERC20", TOKEN_CONTRACT_ADDRESS);
        const tx = await tokenContract.approve(VAULT_CONTRACT_ADDRESS, hre.ethers.parseEther(amount.toString()))
        await tx.wait();

        const tx2 = await vaultContract.deposit(TOKEN_CONTRACT_ADDRESS, hre.ethers.parseEther(amount.toString()))
        await tx2.wait();
    
        console.log(`Deposited ${amount} ${token} to the vault`);
        console.log(`Transaction hash: ${tx.hash}`);
    }
}

main(5.09, Tokens.USDT);

// npx hardhat run ./scripts/deposit.ts --network bscTestnet