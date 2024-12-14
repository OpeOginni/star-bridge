import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import hre from "hardhat";
import { Tokens, TOKENS_MAP } from "../../../lib/tokens";
import { HARDHAT_TOKENS_MAP } from "../../constants/tokens";



const StarBridgeVaultModule = buildModule("StarBridgeVault", (m) => {

    const USDT_ADDRESS = HARDHAT_TOKENS_MAP[Tokens.USDT][hre.network.name as 'bsc' | 'bscTestnet' | 'opBNB' | 'opBNBTestnet'];
    const USDC_ADDRESS = HARDHAT_TOKENS_MAP[Tokens.USDC][hre.network.name as 'bsc' | 'bscTestnet'];

    const filteredAddresses = [USDT_ADDRESS, USDC_ADDRESS].filter(address => address !== undefined);
    
    const acceptedTokens = m.getParameter("acceptedTokens", filteredAddresses);

    const vault = m.contract("StarBridgeVault", [acceptedTokens]);

    return { vault };
})

export default StarBridgeVaultModule;