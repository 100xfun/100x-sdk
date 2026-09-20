# Quick Start Guide

This guide will help you quickly get started with the 100x SDK.

## Installation

### NPM Installation

```bash
npm install 100x-sdk @solana/web3.js @coral-xyz/anchor
```

### Yarn Installation

```bash
yarn add 100x-sdk @solana/web3.js @coral-xyz/anchor
```

## Basic Setup

### 1. Import the SDK

```javascript
const { Fun100xSdk, getDefaultOptions, FUN100X_PROGRAM_ID } = require('100x-sdk');
const { Connection, Keypair } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
```

### 2. Choose a Network and Initialize

100x SDK supports three network environments:

```javascript
// Method 1: Use predefined network configuration
const options = getDefaultOptions('LOCALNET');  // 'MAINNET', 'DEVNET', 'LOCALNET'

// Method 2: Custom configuration
const customOptions = {
  defaultDataSource: 'fast',  // 'fast' (API) or 'chain' (on-chain direct read)
  solanaEndpoint: 'http://localhost:8899',
  fastApiUrl: 'http://localhost:3000',
  feeRecipient: 'fee-recipient-address',
  baseFeeRecipient: 'base-fee-recipient-address',
  paramsAccount: 'params-account-address'
};
```

### 3. Create Connection and SDK Instance

```javascript
// Create Solana connection
const connection = new Connection(options.solanaEndpoint, 'confirmed');

// Initialize SDK
const sdk = new Fun100xSdk(
  connection,
  FUN100X_PROGRAM_ID,  // Use the program ID provided by the SDK
  options
);
```

## First Trading Example

### Buying Tokens

```javascript
const anchor = require('@coral-xyz/anchor');

async function buyToken() {
  // 1. Prepare parameters
  const mintAccount = 'token-address';  // Token mint address
  const buyTokenAmount = new anchor.BN('1000000');  // Purchase amount (6 decimals)
  const maxSolAmount = new anchor.BN('2000000000');  // Maximum SOL to spend (9 decimals)

  // 2. Build transaction
  const result = await sdk.trading.buy({
    mintAccount: mintAccount,
    buyTokenAmount: buyTokenAmount,
    maxSolAmount: maxSolAmount,
    payer: wallet.publicKey
  });

  // 3. Set transaction parameters
  result.transaction.feePayer = wallet.publicKey;
  result.transaction.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;

  // 4. Sign additional signers (if any)
  if (result.signers.length > 0) {
    result.transaction.partialSign(...result.signers);
  }

  // 5. Sign and send transaction
  const signature = await wallet.sendTransaction(result.transaction, connection);

  // 6. Confirm transaction
  await connection.confirmTransaction(signature);

  console.log('Transaction successful!', signature);
}
```

## Data Retrieval Example

### Getting Token Price

```javascript
async function getTokenPrice(mint) {
  // Use unified data interface (automatically routes to configured data source)
  const price = await sdk.data.price(mint);
  console.log('Token price:', price);

  // Or directly specify data source
  const fastPrice = await sdk.fast.price(mint);  // Get from API
  const chainPrice = await sdk.chain.price(mint);  // Get from chain

  return price;
}
```

### Getting Order Data

```javascript
async function getOrders(mint) {
  // Get long orders
  const longOrders = await sdk.data.orders(mint, {
    type: 'down_orders',  // Long orders
    page: 1,
    limit: 100
  });

  // Get short orders
  const shortOrders = await sdk.data.orders(mint, {
    type: 'up_orders',  // Short orders
    page: 1,
    limit: 100
  });

  console.log('Total orders:', longOrders.data.total);
  console.log('Order list:', longOrders.data.orders);

  return longOrders;
}
```

### Getting User Orders

```javascript
async function getUserOrders(userAddress, mint) {
  const userOrders = await sdk.data.user_orders(userAddress, mint, {
    page: 1,
    limit: 20,
    order_by: 'start_time_desc'  // Sort by start time descending
  });

  console.log('Number of user orders:', userOrders.data.total);
  console.log('User orders:', userOrders.data.orders);

  return userOrders;
}
```

## Trading Simulation Example

### Simulating a Buy

```javascript
async function simulateBuy(mint, buyTokenAmount) {
  const simulation = await sdk.simulator.simulateTokenBuy(
    mint,
    buyTokenAmount
  );

  console.log('Completion rate:', simulation.completion, '%');
  console.log('Price slippage:', simulation.slippage, '%');
  console.log('Suggested purchase amount:', simulation.suggestedTokenAmount);
  console.log('Required SOL amount:', simulation.suggestedSolAmount);

  return simulation;
}
```

## Complete Example Program

```javascript
const { Fun100xSdk, getDefaultOptions, FUN100X_PROGRAM_ID } = require('100x-sdk');
const { Connection, Keypair } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');

async function main() {
  // 1. Get configuration
  const options = getDefaultOptions('LOCALNET');

  // 2. Create connection
  const connection = new Connection(options.solanaEndpoint, 'confirmed');

  // 3. Load wallet
  const wallet = Keypair.generate();  // Or load from file

  // 4. Initialize SDK
  const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, options);

  // 5. Use SDK
  const mint = 'token-address';

  // Get price
  const price = await sdk.data.price(mint);
  console.log('Current price:', price);

  // Get orders
  const orders = await sdk.data.orders(mint, { type: 'down_orders' });
  console.log('Number of orders:', orders.data.total);

  // Simulate trade
  const simulation = await sdk.simulator.simulateTokenBuy(
    mint,
    1000000n  // 1 token
  );
  console.log('Trade simulation result:', simulation);
}

main().catch(console.error);
```

## Data Source Configuration

SDK provides two data sources:

### Fast (API Data Source)
- **Advantages**: Fast speed, quick response
- **Disadvantages**: May have delays during peak periods, depends on API service availability
- **Use Cases**: General queries, displaying data

```javascript
const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, {
  ...options,
  defaultDataSource: 'fast'
});
```

### Chain (On-chain Data Source)
- **Advantages**: Reliable data, no dependency on third-party services
- **Disadvantages**: Slower speed, consumes more RPC requests
- **Use Cases**: Important transactions, data verification

```javascript
const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, {
  ...options,
  defaultDataSource: 'chain'
});
```

### Temporarily Switching Data Source

```javascript
// Default to fast, temporarily use chain
const orders = await sdk.data.orders(mint, {
  type: 'down_orders',
  dataSource: 'chain'  // Temporarily specify data source
});
```

## Common Configuration Constants

SDK has some important built-in constants:

```javascript
// Maximum order processing count (matches contract limit)
sdk.MAX_ORDERS_COUNT  // 9

// Maximum fetch count when searching orders
sdk.FIND_MAX_ORDERS_COUNT  // 1000

// Suggested liquidity usage ratio (97.5%)
sdk.SUGGEST_LIQ_RATIO  // 975
```

## Error Handling

```javascript
async function safeOperation() {
  try {
    const price = await sdk.data.price(mint);
    return price;
  } catch (error) {
    console.error('Failed to get price:', error.message);

    // Handle based on error type
    if (error.message.includes('Network request failed')) {
      // Network error, may need to retry
    } else if (error.message.includes('API request failed')) {
      // API error, may need to switch data source
    }

    throw error;
  }
}
```

## Precision Handling Notes

### SOL Precision
- SOL uses 9 decimal places
- 1 SOL = 1,000,000,000 lamports

```javascript
const oneSol = new anchor.BN('1000000000');  // 1 SOL
const halfSol = new anchor.BN('500000000');  // 0.5 SOL
```

### Token Precision
- Token uses 6 decimal places
- 1 Token = 1,000,000 smallest units

```javascript
const oneToken = new anchor.BN('1000000');  // 1 Token
const halfToken = new anchor.BN('500000');  // 0.5 Token
```

### Price Precision
- Price uses u128 format, 28-bit precision
- Use CurveAMM utility class for conversion

```javascript
const { CurveAMM } = require('100x-sdk');

// u128 to decimal
const decimalPrice = CurveAMM.u128ToDecimal(priceU128);
console.log('Price:', decimalPrice.toString());

// Decimal to u128
const priceU128 = CurveAMM.decimalToU128(decimalPrice);
```

## Next Steps

- Check [Fun100xSdk Main Class Documentation](./02-100x-sdk-main-class.md) for more configuration options
- Check [TradingModule Documentation](./03-trading-module.md) to learn complete trading functions
- Check [SimulatorModule Documentation](./08-simulator-module.md) to understand trade simulation features

## FAQ

### Q: How to choose a data source?
A: Use `fast` for general queries, use `chain` for important transactions, or dynamically switch based on network conditions.

### Q: What to do if a transaction fails?
A: Check parameter precision, account balance, network connection, and review specific error messages for troubleshooting.

### Q: How to handle large transactions?
A: Use the simulator to pre-calculate slippage and completion rate, ensure sufficient liquidity before executing the transaction.

### Q: Which environments does the SDK support?
A: Supports Node.js 14+ and modern browsers (Chrome, Firefox, Safari, etc.).

---

**Related Documentation**:
- [Fun100xSdk Main Class](./02-100x-sdk-main-class.md)
- [TradingModule Trading Module](./03-trading-module.md)
- [Data Module Comparison](./04-fast-module.md)
