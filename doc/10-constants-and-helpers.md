# Constants and Helper Functions Documentation

This document introduces the constant definitions, helper functions, and configuration tools in the 100x SDK.

## Table of Contents

- [Program Constants](#program-constants)
- [Network Configuration](#network-configuration)
- [SDK Configuration Constants](#sdk-configuration-constants)
- [Helper Functions](#helper-functions)
- [Type Definitions](#type-definitions)

---

## Program Constants

### FUN100X_PROGRAM_ID

The program ID of the 100x smart contract.

```javascript
const { FUN100X_PROGRAM_ID } = require('100x-sdk');

console.log('Program ID:', FUN100X_PROGRAM_ID);
// Output: Program ID string
```

**Description**: This is the unique identifier of the 100x program deployed on the Solana chain, used to initialize the SDK.

---

## Network Configuration

### getDefaultOptions()

Get preset network configuration options.

#### Function Signature

```typescript
function getDefaultOptions(networkName?: 'MAINNET' | 'DEVNET' | 'LOCALNET'): NetworkConfig
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `networkName` | `string` | No | `'MAINNET'` | Network name |

#### Return Value Type

```typescript
interface NetworkConfig {
  name: string;                    // Network name
  defaultDataSource: DataSourceType; // Default data source ('fast' or 'chain')
  solanaEndpoint: string;          // Solana RPC endpoint
  fastApiUrl: string;        // API service address
  feeRecipient: string;            // Fee recipient address
  baseFeeRecipient: string;        // Base fee recipient address
  paramsAccount: string;           // Params account address
}
```

#### Usage Examples

```javascript
const { getDefaultOptions } = require('100x-sdk');

// Get mainnet configuration
const mainnetOptions = getDefaultOptions('MAINNET');
console.log('Mainnet config:', mainnetOptions);

// Get testnet configuration
const devnetOptions = getDefaultOptions('DEVNET');
console.log('Testnet config:', devnetOptions);

// Get localnet configuration
const localnetOptions = getDefaultOptions('LOCALNET');
console.log('Localnet config:', localnetOptions);

// Use default configuration (mainnet)
const defaultOptions = getDefaultOptions();
console.log('Default config:', defaultOptions);
```

#### Preset Configuration Details

##### MAINNET Configuration

```javascript
{
  name: 'MAINNET',
  defaultDataSource: 'fast',
  solanaEndpoint: 'https://api.mainnet-beta.solana.com',
  fastApiUrl: 'https://api.pinpet.io',
  feeRecipient: 'GesAj2dTn2wdNcxj4x8qsqS9aNRVPBPkE76aaqg7skxu',
  baseFeeRecipient: '5YHi1HsxobLiTD6NQfHJQpoPoRjMuNyXp4RroTvR6dKi',
  paramsAccount: '4yTBVZZQLiYi2p2xgwQXPb329z9jsQnhoPJyGmF3R4hb'
}
```

##### DEVNET Configuration

```javascript
{
  name: 'DEVNET',
  defaultDataSource: 'fast',
  solanaEndpoint: 'https://api.devnet.solana.com',
  fastApiUrl: 'https://devnet-api.pinpet.io',
  feeRecipient: 'GesAj2dTn2wdNcxj4x8qsqS9aNRVPBPkE76aaqg7skxu',
  baseFeeRecipient: '5YHi1HsxobLiTD6NQfHJQpoPoRjMuNyXp4RroTvR6dKi',
  paramsAccount: '4yTBVZZQLiYi2p2xgwQXPb329z9jsQnhoPJyGmF3R4hb'
}
```

##### LOCALNET Configuration

```javascript
{
  name: 'LOCALNET',
  defaultDataSource: 'chain',  // Localnet defaults to chain data source
  solanaEndpoint: 'http://localhost:8899',
  fastApiUrl: 'http://localhost:3000',
  feeRecipient: 'GesAj2dTn2wdNcxj4x8qsqS9aNRVPBPkE76aaqg7skxu',
  baseFeeRecipient: '5YHi1HsxobLiTD6NQfHJQpoPoRjMuNyXp4RroTvR6dKi',
  paramsAccount: '4yTBVZZQLiYi2p2xgwQXPb329z9jsQnhoPJyGmF3R4hb'
}
```

#### Custom Configuration Example

```javascript
const { getDefaultOptions, Fun100xSdk, FUN100X_PROGRAM_ID } = require('100x-sdk');
const { Connection } = require('@solana/web3.js');

// Customize based on preset configuration
const options = getDefaultOptions('MAINNET');

// Modify partial configuration
const customOptions = {
  ...options,
  defaultDataSource: 'chain',  // Change to chain data source
  solanaEndpoint: 'https://my-custom-rpc.com'  // Use custom RPC
};

// Initialize SDK with custom configuration
const connection = new Connection(customOptions.solanaEndpoint);
const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, customOptions);
```

---

## SDK Configuration Constants

These constants can be accessed after SDK instance initialization.

### MAX_ORDERS_COUNT

Maximum number of orders processed per transaction, matching smart contract limit.

```javascript
const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, options);

console.log('Max orders:', sdk.MAX_ORDERS_COUNT);  // 9
```

**Value**: `9`

**Description**: At most 9 order accounts can be included when building a transaction. This is a contract-level limit.

**Use Case**:
```javascript
// Use when building LP pairs
const lpPairs = sdk.buildLpPairs(orders, 'buy', price, sdk.MAX_ORDERS_COUNT);
```

### FIND_MAX_ORDERS_COUNT

Maximum number of orders to fetch when searching for order relationships.

```javascript
console.log('Find max orders:', sdk.FIND_MAX_ORDERS_COUNT);  // 1000
```

**Value**: `1000`

**Description**: Maximum number of orders to fetch from the order book when finding order prev/next relationships.

### SUGGEST_LIQ_RATIO

Suggested liquidity usage ratio, denominator is 1000 (i.e., per mille).

```javascript
console.log('Suggested liquidity ratio:', sdk.SUGGEST_LIQ_RATIO);  // 975 (97.5%)
```

**Value**: `975` (97.5%)

**Description**: When liquidity is insufficient, the suggested ratio of actual liquidity to use, leaving a 2.5% safety margin.

**Usage Example**:
```javascript
// Calculate suggested liquidity to use
const totalLiquidity = 1000000000n;  // 1 SOL
const suggestedLiquidity = (totalLiquidity * BigInt(sdk.SUGGEST_LIQ_RATIO)) / 1000n;
console.log('Suggested liquidity:', suggestedLiquidity);  // 975000000 (0.975 SOL)
```

---

## Helper Functions

### Precision Conversion Helper Functions

Although the SDK doesn't directly export these helper functions, they can be accessed through the `CurveAMM` utility class:

```javascript
const { CurveAMM } = require('100x-sdk');
const anchor = require('@coral-xyz/anchor');

// SOL to lamports
const solToLamports = (sol) => {
  return anchor.BN.isBN(sol)
    ? sol
    : new anchor.BN(Math.floor(sol * 1e9).toString());
};

// Lamports to SOL
const lamportsToSol = (lamports) => {
  const bn = anchor.BN.isBN(lamports) ? lamports : new anchor.BN(lamports.toString());
  return bn.toNumber() / 1e9;
};

// Token to smallest unit
const tokenToUnits = (token) => {
  return new anchor.BN(Math.floor(token * 1e6).toString());
};

// Smallest unit to Token
const unitsToToken = (units) => {
  const bn = anchor.BN.isBN(units) ? units : new anchor.BN(units.toString());
  return bn.toNumber() / 1e6;
};

// Usage examples
console.log('1 SOL =', solToLamports(1).toString(), 'lamports');
console.log('1000000000 lamports =', lamportsToSol('1000000000'), 'SOL');
console.log('1 Token =', tokenToUnits(1).toString(), 'units');
console.log('1000000 units =', unitsToToken('1000000'), 'Token');
```

### Price Formatting Helper Functions

```javascript
const { CurveAMM } = require('100x-sdk');

// Format price display
function formatPrice(priceU128, decimalPlaces = 10) {
  return CurveAMM.formatPriceForDisplay(priceU128, decimalPlaces);
}

// Create complete price display string
function createPriceDisplay(priceU128) {
  return CurveAMM.createPriceDisplayString(priceU128, 10);
}

// Usage examples
const price = '2795899347623485554';
console.log('Formatted price:', formatPrice(price));
console.log('Complete display:', createPriceDisplay(price));
```

### PublicKey Conversion Helper Functions

```javascript
const { PublicKey } = require('@solana/web3.js');

// String to PublicKey
function toPublicKey(key) {
  if (!key) return null;
  return typeof key === 'string' ? new PublicKey(key) : key;
}

// PublicKey to string
function toString(key) {
  if (!key) return null;
  return typeof key === 'string' ? key : key.toString();
}

// Validate PublicKey
function isValidPublicKey(key) {
  try {
    new PublicKey(key);
    return true;
  } catch {
    return false;
  }
}

// Usage examples
const keyString = 'GesAj2dTn2wdNcxj4x8qsqS9aNRVPBPkE76aaqg7skxu';
console.log('Is valid:', isValidPublicKey(keyString));
const pubkey = toPublicKey(keyString);
console.log('PublicKey:', pubkey.toString());
```

---

## Type Definitions

### DataSourceType

Data source type definition.

```typescript
type DataSourceType = 'fast' | 'chain';
```

**Description**:
- `'fast'`: Use API data source, fast speed
- `'chain'`: Use chain data source, more reliable

### TransactionResult

Unified transaction result return type.

```typescript
interface TransactionResult {
  transaction: Transaction;           // Unsigned transaction object
  signers: Keypair[];                // Additional signers array
  accounts: Record<string, PublicKey>; // Related account address mapping
  orderData?: {                      // Order-related data (optional)
    ordersUsed: number;              // Number of orders used
    lpPairsCount: number;            // LP pair count
    lpPairs: LpPair[];               // LP pair array
    orderAccounts: (string | null)[]; // Order account address array
    [key: string]: any;              // Other dynamic fields
  };
}
```

### LpPair

Liquidity pair type.

```typescript
interface LpPair {
  solAmount: BN;    // SOL amount
  tokenAmount: BN;  // Token amount
}
```

### OrderData

Order data type.

```typescript
interface OrderData {
  order_pda: string;              // Order PDA address
  user: string;                   // User address
  mint: string;                   // Token address
  order_type: string;             // Order type ('up_orders' or 'down_orders')
  lock_lp_sol_amount: string;     // Locked LP SOL amount
  lock_lp_token_amount: string;   // Locked LP Token amount
  lock_lp_start_price: string;    // LP start price
  lock_lp_end_price: string;      // LP end price
  margin_sol_amount: string;      // Margin SOL amount
  borrow_amount: string;          // Borrow amount
  position_asset_amount: string;  // Position asset amount
  created_at?: string;            // Creation time
  updated_at?: string;            // Update time
  // ... more fields
}
```

For complete type definitions, refer to [dist/index.d.ts](../dist/index.d.ts)

---

## Environment Detection

Internal environment detection constants used by the SDK (for reference only):

```javascript
// Detect Node.js environment
const IS_NODE = typeof process !== 'undefined'
  && process.versions
  && process.versions.node;

// Conditionally load modules based on environment
if (IS_NODE) {
  const fs = require('fs');
  const path = require('path');
  // Node.js specific functionality
} else {
  // Browser specific functionality
}
```

---

## Complete Examples

### Example 1: Initialize SDK in Different Environments

```javascript
const {
  Fun100xSdk,
  getDefaultOptions,
  FUN100X_PROGRAM_ID
} = require('100x-sdk');
const { Connection } = require('@solana/web3.js');

// Mainnet SDK
function createMainnetSdk() {
  const options = getDefaultOptions('MAINNET');
  const connection = new Connection(options.solanaEndpoint, 'confirmed');
  return new Fun100xSdk(connection, FUN100X_PROGRAM_ID, options);
}

// Testnet SDK
function createDevnetSdk() {
  const options = getDefaultOptions('DEVNET');
  const connection = new Connection(options.solanaEndpoint, 'confirmed');
  return new Fun100xSdk(connection, FUN100X_PROGRAM_ID, options);
}

// Localnet SDK
function createLocalnetSdk() {
  const options = getDefaultOptions('LOCALNET');
  const connection = new Connection(options.solanaEndpoint, 'confirmed');
  return new Fun100xSdk(connection, FUN100X_PROGRAM_ID, options);
}

// Usage
const mainnetSdk = createMainnetSdk();
const devnetSdk = createDevnetSdk();
const localnetSdk = createLocalnetSdk();
```

### Example 2: Use Configuration Constants

```javascript
async function buildOptimizedTransaction(sdk, orders, price) {
  // Use MAX_ORDERS_COUNT to limit order count
  const maxOrders = sdk.MAX_ORDERS_COUNT;
  const limitedOrders = orders.slice(0, maxOrders);

  // Use SUGGEST_LIQ_RATIO to calculate suggested liquidity
  const totalLiquidity = calculateTotalLiquidity(limitedOrders);
  const suggestedLiquidity = (totalLiquidity * BigInt(sdk.SUGGEST_LIQ_RATIO)) / 1000n;

  console.log(`Using ${limitedOrders.length}/${orders.length} orders`);
  console.log(`Suggested liquidity: ${suggestedLiquidity} / ${totalLiquidity}`);

  // Build transaction...
}
```

### Example 3: Custom Configuration Utility Function

```javascript
const { getDefaultOptions } = require('100x-sdk');

/**
 * Create custom network configuration
 */
function createCustomConfig(baseNetwork, overrides = {}) {
  const baseConfig = getDefaultOptions(baseNetwork);
  return {
    ...baseConfig,
    ...overrides
  };
}

// Mainnet config with custom RPC
const customMainnet = createCustomConfig('MAINNET', {
  solanaEndpoint: 'https://my-rpc.example.com',
  defaultDataSource: 'chain'
});

// Testnet config with custom API
const customDevnet = createCustomConfig('DEVNET', {
  fastApiUrl: 'https://my-api.example.com'
});
```

---

## Notes

1. **Network Configuration Selection**:
   - Use `LOCALNET` or `DEVNET` for development and testing
   - Use `MAINNET` for production

2. **Data Source Configuration**:
   - `fast` is suitable for frequent queries, fast speed
   - `chain` is suitable for important operations, more reliable

3. **Constant Usage**:
   - SDK constants are accessed through the instance (`sdk.MAX_ORDERS_COUNT`)
   - Program constants are directly imported (`FUN100X_PROGRAM_ID`)

4. **Configuration Modification**:
   - Use `getDefaultOptions()` to get base configuration
   - Modify partial configuration through object spread syntax
   - Don't directly modify returned configuration objects

5. **Type Safety**:
   - TypeScript projects should use type definitions in `dist/index.d.ts`
   - JavaScript projects refer to interface descriptions in this document

---

## Related Documentation

- [Quick Start](./01-quick-start.md)
- [Fun100xSdk Main Class](./02-100x-sdk-main-class.md)
- [CurveAMM Utility Class](./09-curve-amm-utility.md)
- [TypeScript Type Definitions](../dist/index.d.ts)

---

**Documentation Version**: 2.0.0
**Last Updated**: 2025-11-26
