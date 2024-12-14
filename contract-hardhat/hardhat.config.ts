import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";

dotenv.config({path: "../.env"});

const privateKey = process.env.ADMIN_WALLET_PRIVATE_KEY;
const alchemyApiKey = process.env.ALCHEMY_API_KEY;

if(!privateKey || !alchemyApiKey)
  throw new Error("ADMIN_WALLET_PRIVATE_KEY or ALCHEMY_API_KEY not found in environment variables");

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    bsc: {
      url: `https://bnb-mainnet.g.alchemy.com/v2/${alchemyApiKey}`,
      accounts: [privateKey]
    },
    bscTestnet: {
      url: `https://bnb-testnet.g.alchemy.com/v2/${alchemyApiKey}`,
      accounts: [privateKey]
    },
    opBNB: {
      url: `https://opbnb-mainnet.g.alchemy.com/v2/${alchemyApiKey}`,
      accounts: [privateKey],
      chainId: 204
    },
    opBNBTestnet: {
      url: `https://opbnb-testnet.g.alchemy.com/v2/${alchemyApiKey}`,
      accounts: [privateKey],
      chainId: 5611
    }
  },
  etherscan: {
    apiKey: {
      bsc: process.env.BSC_SCAN_API_KEY || "",
      bscTestnet: process.env.BSC_SCAN_API_KEY || "",
      opBNB: process.env.OP_BNB_SCAN_API_KEY || "",
      opBNBTestnet: process.env.OP_BNB_SCAN_API_KEY || ""
    }, 
    customChains: [
      {
        network: "opBNB",
        chainId: 204,
        urls: {
          apiURL: "https://api-opbnb.bscscan.com/",
          browserURL: "https://opbnb.bscscan.com/"
        }
      },
      {
        network: "opBNBTestnet",
        chainId: 5611,
        urls: {
          apiURL: "https://api-opbnb-testnet.bscscan.com/api",
          browserURL: "https://opbnb-testnet.bscscan.com/"
        }
      }
    ]
  }
};

export default config;
