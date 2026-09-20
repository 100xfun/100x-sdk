# 100x SDK

A JavaScript/TypeScript SDK for interacting with the 100x protocol on the Solana blockchain. Supports both Node.js and browser environments, providing modular functionality for trading, token management, order management, and more.

[![npm version](https://img.shields.io/npm/v/100x-sdk.svg)](https://www.npmjs.com/package/100x-sdk)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Features

- =€ **Spot Trading**: Direct buy and sell operations for tokens
- =Ê **Margin Trading**: Leverage trading with long/short positions
- = **Dual Data Sources**: Fast API and reliable on-chain data access
- =° **Token Creation**: Create and launch new tokens on the protocol
- <¯ **Trade Simulation**: Pre-calculate slippage and costs before execution
- =à **Comprehensive Tooling**: Order management, AMM calculations, and utilities
- < **Cross-Platform**: Works in Node.js and modern browsers
- =æ **Modular Design**: Clean, intuitive API with separate functional modules

## Installation

```bash
npm install 100x-sdk @solana/web3.js @coral-xyz/anchor
```

or with Yarn:

```bash
yarn add 100x-sdk @solana/web3.js @coral-xyz/anchor
```

## Quick Start

```javascript
const { Fun100xSdk, getDefaultOptions, FUN100X_PROGRAM_ID } = require('100x-sdk');
const { Connection } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');

// 1. Get network configuration
const options = getDefaultOptions('MAINNET'); // or 'DEVNET', 'LOCALNET'

// 2. Create connection
const connection = new Connection(options.solanaEndpoint, 'confirmed');

// 3. Initialize SDK
const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, options);

// 4. Example: Buy tokens
const result = await sdk.trading.buy({
  mintAccount: "TOKEN_ADDRESS",
  buyTokenAmount: new anchor.BN('1000000'), // 1 token (6 decimals)
  maxSolAmount: new anchor.BN('2000000000'), // 2 SOL (9 decimals)
  payer: wallet.publicKey
});

// 5. Sign and send transaction
result.transaction.feePayer = wallet.publicKey;
result.transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
result.transaction.sign(wallet);

const signature = await connection.sendRawTransaction(result.transaction.serialize());
await connection.confirmTransaction(signature);

console.log('Transaction successful!', signature);
```

## SDK Architecture

The SDK is organized into functional modules, all accessible through the main `Fun100xSdk` class:

```javascript
const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, options);

// Trading operations
await sdk.trading.buy({...});
await sdk.trading.sell({...});
await sdk.trading.long({...});
await sdk.trading.short({...});

// Data access (unified interface)
const orders = await sdk.data.orders(mint, { type: 'down_orders' });
const price = await sdk.data.price(mint);

// Token creation
await sdk.token.create({...});

// Trade simulation
const simulation = await sdk.simulator.simulateTokenBuy(mint, amount);

// Utility tools
await sdk.tools.approveTrade({...});
```

## Module Overview

| Module | Purpose | Key Methods |
|--------|---------|-------------|
| **TradingModule** | Execute trades | `buy`, `sell`, `long`, `short`, `closeLong`, `closeShort` |
| **FastModule** | API data access | `mints`, `mint_info`, `orders`, `price`, `user_orders` |
| **ChainModule** | On-chain data | `getCurveAccount`, `orders`, `price`, `user_orders` |
| **TokenModule** | Token creation | `create`, `createAndBuy` |
| **ParamModule** | Parameter management | `createParams`, `getParams`, `getAdmin` |
| **SimulatorModule** | Trade simulation | `simulateTokenBuy`, `simulateTokenSell`, `simulateLongStopLoss` |
| **ToolsModule** | Utility functions | `approveTrade`, `closeTradeCooldown`, `validateCooldown` |
| **CurveAMM** | AMM calculations | `u128ToDecimal`, `buyFromPriceToPrice`, `sellFromPriceToPrice` |

## Documentation

### Quick Reference

- =Ö **[Quick Start Guide](./doc/01-quick-start.md)** - Get up and running quickly
- <× **[SDK Main Class](./doc/02-100x-sdk-main-class.md)** - Core initialization and configuration
- =Ú **[Complete Documentation Index](./doc/README.md)** - Full documentation table of contents

### Core Modules

- **[Trading Module](./doc/03-trading-module.md)** - Spot and margin trading operations _(Translation in progress)_
- **[Fast Module](./doc/04-fast-module.md)** - API-based data access _(Translation in progress)_
- **[Chain Module](./doc/05-chain-module.md)** - On-chain data reading _(Translation in progress)_
- **[Token Module](./doc/06-token-module.md)** - Token creation and management
- **[Param Module](./doc/07-param-module.md)** - Partner parameter management
- **[Simulator Module](./doc/08-simulator-module.md)** - Trade simulation and calculations _(Translation in progress)_

### Utilities

- **[CurveAMM Utility](./doc/09-curve-amm-utility.md)** - AMM curve calculations _(Translation in progress)_
- **[Constants & Helpers](./doc/10-constants-and-helpers.md)** - Configuration and helper functions
- **[Tools Module](./doc/11-tools-module.md)** - Trading utilities and cooldown management
- **[Position Tab Guide](./doc/position-tab-guide.md)** - UI integration guide for positions

### Language Options

- <ú<ø **English Documentation**: [./doc/](./doc/) (Current)
- <è<ó **-‡‡c**: [./doc_cn/](./doc_cn/)

## Network Configuration

The SDK supports three network environments:

```javascript
// Mainnet (Production)
const mainnetOptions = getDefaultOptions('MAINNET');

// Devnet (Testing)
const devnetOptions = getDefaultOptions('DEVNET');

// Localnet (Local Development)
const localnetOptions = getDefaultOptions('LOCALNET');
```

## Data Source Options

Choose between fast API access or reliable on-chain reading:

```javascript
// Fast API (default) - Quick responses, slight latency
const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, {
  ...options,
  defaultDataSource: 'fast'
});

// On-chain direct reading - More reliable, slower
const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, {
  ...options,
  defaultDataSource: 'chain'
});

// Or switch temporarily per call
const orders = await sdk.data.orders(mint, {
  type: 'down_orders',
  dataSource: 'chain' // Override default
});
```

## Key Concepts

### Precision Handling

- **SOL**: 9 decimal places (lamports) - `1 SOL = 1,000,000,000 lamports`
- **Tokens**: 6 decimal places - `1 Token = 1,000,000 units`
- **Price**: u128 format with 28-digit precision

```javascript
// SOL amounts
const oneSol = new anchor.BN('1000000000'); // 1 SOL

// Token amounts
const oneToken = new anchor.BN('1000000'); // 1 Token

// Price conversion
const { CurveAMM } = require('100x-sdk');
const decimalPrice = CurveAMM.u128ToDecimal(priceU128);
const priceU128 = CurveAMM.decimalToU128(decimalPrice);
```

### Transaction Signing

The SDK returns unsigned transactions for security and wallet compatibility:

```javascript
// SDK builds the transaction
const result = await sdk.trading.buy({...});

// You control the signing
result.transaction.feePayer = wallet.publicKey;
result.transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

// Sign with your wallet
const signature = await wallet.sendTransaction(result.transaction, connection);
```

## Example Use Cases

### Spot Trading

```javascript
// Buy tokens
const buyResult = await sdk.trading.buy({
  mintAccount: mint,
  buyTokenAmount: new anchor.BN('1000000'),
  maxSolAmount: new anchor.BN('2000000000'),
  payer: wallet.publicKey
});

// Sell tokens
const sellResult = await sdk.trading.sell({
  mintAccount: mint,
  sellTokenAmount: new anchor.BN('1000000'),
  minSolOutput: new anchor.BN('1800000000'),
  payer: wallet.publicKey
});
```

### Margin Trading

```javascript
// Open long position
const longResult = await sdk.trading.long({
  mintAccount: mint,
  buyTokenAmount: new anchor.BN('10000000'),
  maxSolAmount: new anchor.BN('20000000000'),
  marginSol: new anchor.BN('5000000000'),
  closePrice: new anchor.BN('...'),
  closeInsertIndices: [...],
  payer: wallet.publicKey
});

// Close long position
const closeResult = await sdk.trading.closeLong({
  mintAccount: mint,
  sellTokenAmount: new anchor.BN('10000000'),
  minSolOutput: new anchor.BN('18000000000'),
  closeOrderId: orderId,
  closeOrderIndices: [...],
  payer: wallet.publicKey,
  userSolAccount: orderOwner
});
```

### Data Queries

```javascript
// Get token list
const tokens = await sdk.fast.mints({ limit: 10 });

// Get token price
const price = await sdk.data.price(mint);

// Get orders
const orders = await sdk.data.orders(mint, { type: 'down_orders' });

// Get user orders
const userOrders = await sdk.data.user_orders(userAddress, mint);
```

### Trade Simulation

```javascript
// Simulate buy before execution
const simulation = await sdk.simulator.simulateTokenBuy(mint, buyTokenAmount);

console.log('Completion:', simulation.completion + '%');
console.log('Slippage:', simulation.slippage + '%');
console.log('Suggested SOL:', simulation.suggestedSolAmount);

// Use simulation results in actual trade
const result = await sdk.trading.buy({
  mintAccount: mint,
  buyTokenAmount: new anchor.BN(buyTokenAmount),
  maxSolAmount: new anchor.BN(simulation.suggestedSolAmount),
  payer: wallet.publicKey
});
```

## Development

### Build

```bash
npm run build          # Build all distribution formats (CJS, ESM, UMD)
npm run build:dev      # Watch mode for development
```

### Testing

```bash
# Run individual test files
node tests/example-trading-buy.js
node tests/test-closeShort.js

# Standard test commands (coming soon)
npm test
```

### Linting

```bash
npm run lint
```

## Important Notes

1. **Data Source Selection**
   - `fast` (API) - Fast responses, may have slight delays during peak times
   - `chain` (Direct) - More reliable, slower, no third-party dependencies

2. **Transaction Signing**
   - SDK returns unsigned transactions
   - Signing must be done externally for security
   - Compatible with hardware wallets and browser extensions

3. **Error Handling**
   - All async methods can throw exceptions
   - Always implement proper error handling
   - Use try-catch blocks around SDK calls

4. **Precision**
   - Always use `anchor.BN` for amounts
   - Remember decimal places: SOL (9), Token (6)
   - Use CurveAMM utilities for price conversions

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

- **Documentation**: [./doc/README.md](./doc/README.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/100x-sdk/issues)
- **Discord**: [Join our community](https://discord.gg/spinpet)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Related Links

- [100x Protocol](https://100x.fun)
- [Solana Documentation](https://docs.solana.com)
- [Anchor Framework](https://www.anchor-lang.com)

---

**Version**: 2.0.0
**Last Updated**: 2024-12-09
