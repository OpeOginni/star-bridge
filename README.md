# Star Bridge Bot 🌉

Convert Telegram Stars into crypto tokens instantly! Star Bridge is a Telegram bot that allows users to exchange their Telegram Stars for various cryptocurrencies across multiple blockchain networks.

## Features

### Core Functionality
- **Multi-Chain Support**: Currently supports BSC and opBNB networks
- **Multiple Tokens**: Support for USDT and USDC (varies by chain)
- **Automatic Rate**: 1 Star = $0.015 USD
- **Real-time Conversion**: Instant token transfers upon successful star payment
- **Vault Balance Checking**: Prevents failed transactions by checking vault balance before processing

### User Features
- Wallet Management
  - `/addwallet` - Add or update wallet address
  - `/removewallet` - Remove wallet address
  - `/wallet` - View current wallet address
- Transaction Management
  - `/buy` - Initiate a star-to-crypto conversion
  - `/history` - View transaction history
  - `/simulate` - Test the payment flow (simulation mode)

### Security Features
- Pre-transaction vault balance verification
- Secure wallet address validation
- Transaction status tracking
- Error handling and user feedback

## Architecture

### Core Components

1. **Bot Layer** (`bot.ts`)
   - Handles user interactions
   - Manages command processing
   - Implements payment flow
   - Session management

2. **Blockchain Layer** (`blockchain/`)
   - `sendToken.ts` - Handles token transfers
   - `sendNative.ts` - Handles native token transfers
   - `getBalance.ts` - Checks vault balances

3. **Database Layer** (MongoDB)
   - User data storage
   - Transaction history
   - Payment tracking

4. **Smart Contract** (`StarBridgeVault.sol`)
   - Manages token vault
   - Handles token deposits/withdrawals
   - Supports both ERC20 and native tokens


## Payment Flow

1. User initiates payment (`/buy` command)
2. Selects blockchain network
3. Selects token
4. System checks vault balance
5. Creates payment invoice
6. Processes star payment
7. Transfers tokens
8. Updates transaction status


## Security Considerations

- All wallet addresses are validated
- Vault balance is checked before transactions
- Payment status is tracked throughout the process
- Error handling for failed transactions
- Secure session management

## Future Improvements

- More token options
- Enhanced error reporting
- Admin dashboard
- Rate adjustment mechanism
- Automated refund system
