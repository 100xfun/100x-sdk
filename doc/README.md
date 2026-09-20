# 100x SDK 2.0 Complete Documentation

100x SDK is a JavaScript/TypeScript SDK for interacting with the 100x protocol on the Solana blockchain. It supports both Node.js and browser environments, providing modular functionality for trading, token management, order management, and more.

## 📚 Documentation Index

### Quick Start
- [Quick Start Guide](./01-quick-start.md) - SDK installation, initialization, and basic usage

### Core Modules

#### Main SDK Class
- [Fun100xSdk Main Class](./02-100x-sdk-main-class.md) - SDK core class and initialization configuration

#### Functional Modules
- [TradingModule Trading Module](./03-trading-module.md) - Buy, sell, long, short, and close position trades
- [FastModule API Data Module](./04-fast-module.md) - Fast data fetching via API
- [ChainModule On-Chain Data Module](./05-chain-module.md) - Direct on-chain data reading
- [TokenModule Token Module](./06-token-module.md) - Token creation and management
- [ParamModule Parameter Module](./07-param-module.md) - Partner parameter management
- [SimulatorModule Simulator Module](./08-simulator-module.md) - Trade simulation and calculations
- [ToolsModule Utility Module](./11-tools-module.md) - Trading utilities and Cooldown management

#### Utility Classes
- [CurveAMM Utility Class](./09-curve-amm-utility.md) - AMM curve calculation utilities
- [Constants and Helper Functions](./10-constants-and-helpers.md) - SDK constants, configuration functions, etc.

## 🚀 SDK Interface Overview

### Main Class Initialization

```javascript
const { Fun100xSdk, getDefaultOptions, FUN100X_PROGRAM_ID } = require('100x-sdk');
const { Connection } = require('@solana/web3.js');

const options = getDefaultOptions('LOCALNET');
const connection = new Connection(options.solanaEndpoint);
const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, options);
```

### Module Quick Reference

| Module | Primary Functions | Core Methods |
|--------|------------------|--------------|
| **TradingModule** | Trading operations | `buy`, `sell`, `long`, `short`, `closeLong`, `closeShort` |
| **FastModule** | API data | `mints`, `mint_info`, `orders`, `price`, `user_orders` |
| **ChainModule** | On-chain data | `getCurveAccount`, `orders`, `price`, `user_orders` |
| **TokenModule** | Token management | `create`, `createAndBuy` |
| **ParamModule** | Parameter management | `createParams`, `getParams`, `getAdmin` |
| **SimulatorModule** | Trade simulation | `simulateTokenBuy`, `simulateTokenSell`, `simulateLongStopLoss`, `simulateShortStopLoss` |
| **ToolsModule** | Trading utilities | `approveTrade`, `closeTradeCooldown`, `validateCooldown` |
| **CurveAMM** | AMM calculations | `u128ToDecimal`, `decimalToU128`, `buyFromPriceToPrice`, `sellFromPriceToPrice` |

### Unified Data Interface (sdk.data)

SDK provides a unified data interface that automatically routes to Fast or Chain modules based on configuration:

```javascript
// Get order data (auto-routed)
const ordersData = await sdk.data.orders(mint, { type: 'down_orders' });

// Get price data
const price = await sdk.data.price(mint);

// Get user orders
const userOrders = await sdk.data.user_orders(user, mint, { page: 1, limit: 20 });
```

## 📖 Interface Categories

### Trading Interfaces
- **Spot Trading**: `sdk.trading.buy()`, `sdk.trading.sell()`
- **Margin Trading**: `sdk.trading.long()`, `sdk.trading.short()`
- **Close Positions**: `sdk.trading.closeLong()`, `sdk.trading.closeShort()`

### Data Query Interfaces
- **Token Information**: `sdk.fast.mint_info()`, `sdk.fast.mints()`
- **Order Data**: `sdk.data.orders()`, `sdk.data.user_orders()`
- **Price Data**: `sdk.data.price()`
- **On-chain Accounts**: `sdk.chain.getCurveAccount()`

### Simulation Calculation Interfaces
- **Buy/Sell Simulation**: `sdk.simulator.simulateTokenBuy()`, `sdk.simulator.simulateTokenSell()`
- **Stop Loss Simulation**: `sdk.simulator.simulateLongStopLoss()`, `sdk.simulator.simulateShortStopLoss()`
- **Close Position Candidates**: `sdk.simulator.simulateLongClose()`, `sdk.simulator.simulateShortClose()`

### Token Management Interfaces
- **Create Token**: `sdk.token.create()`
- **Create and Buy**: `sdk.token.createAndBuy()`

### Parameter Management Interfaces
- **Create Parameters**: `sdk.param.createParams()`
- **Query Parameters**: `sdk.param.getParams()`, `sdk.param.getAdmin()`

### Utility Interfaces
- **Approve Trade**: `sdk.tools.approveTrade()`
- **Validate Cooldown**: `sdk.tools.validateCooldown()`
- **Close Cooldown PDA**: `sdk.tools.closeTradeCooldown()`

## 🔧 Data Type Definitions

For complete TypeScript type definitions, refer to [dist/index.d.ts](../dist/index.d.ts)

### Core Types

```typescript
// Order data
interface OrderData {
  order_pda: string;
  user: string;
  mint: string;
  order_type: string;
  lock_lp_sol_amount: string;
  lock_lp_token_amount: string;
  margin_sol_amount: string;
  borrow_amount: string;
  // ... more fields
}

// Transaction result
interface TransactionResult {
  transaction: Transaction;
  signers: Keypair[];
  accounts: Record<string, PublicKey>;
  orderData?: { /* ... */ };
}

// LP pair
interface LpPair {
  solAmount: BN;
  tokenAmount: BN;
}
```

## 🌐 Network Configuration

SDK supports three network environments:

```javascript
// Mainnet
const mainnetOptions = getDefaultOptions('MAINNET');

// Testnet
const devnetOptions = getDefaultOptions('DEVNET');

// Localnet
const localnetOptions = getDefaultOptions('LOCALNET');
```

## 💡 Usage Examples

### Basic Trading Flow

```javascript
// 1. Initialize SDK
const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, options);

// 2. Build transaction
const result = await sdk.trading.buy({
  mintAccount: "token_address",
  buyTokenAmount: new anchor.BN("1000000"),
  maxSolAmount: new anchor.BN("2000000000"),
  payer: wallet.publicKey
});

// 3. Sign and send
result.transaction.feePayer = wallet.publicKey;
result.transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

if (result.signers.length > 0) {
  result.transaction.partialSign(...result.signers);
}

const signature = await wallet.sendTransaction(result.transaction, connection);
await connection.confirmTransaction(signature);
```

## 📝 Important Notes

1. **Data Source Selection**:
   - `fast` (API) - Fast speed, but may have delays during peak times
   - `chain` (on-chain direct read) - More reliable, but slower

2. **Transaction Signing**: SDK returns unsigned transactions that require external wallet signing

3. **Precision Handling**:
   - SOL: 9 decimal places (lamports)
   - Token: 6 decimal places
   - Price: u128 format, 28-bit precision

4. **Error Handling**: All async methods may throw exceptions, please handle appropriately

## 🔗 Related Links

- [GitHub Repository](https://github.com/your-org/100x-sdk)
- [NPM Package](https://www.npmjs.com/package/100x-sdk)
- [API Documentation](https://api.pinpet.io/docs)
- [100x Protocol](https://100x.fun)

## 📄 License

Please see the LICENSE file in the project root directory.

---

**Documentation Version**: 2.0.0
**Last Updated**: 2025-11-26
