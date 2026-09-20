# Fun100xSdk Main Class Documentation

Fun100xSdk is the core class of the SDK, serving as the central hub that coordinates all functional modules.

## Class Overview

```javascript
class Fun100xSdk {
  constructor(connection, programId, options = {})
}
```

## Constructor

### Parameter Description

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `connection` | `Connection` | Yes | Solana connection instance |
| `programId` | `string \| PublicKey` | Yes | 100x program ID |
| `options` | `Object` | No | Configuration options |

### Options Configuration Object

```typescript
interface Fun100xSdkOptions {
  // Data source configuration
  defaultDataSource?: 'fast' | 'chain';  // Default data source, default 'chain'

  // Network configuration
  solanaEndpoint?: string;               // Solana RPC endpoint
  fastApiUrl?: string;            // API service address

  // Account configuration
  feeRecipient?: string | PublicKey;     // Fee recipient address
  baseFeeRecipient?: string | PublicKey; // Base fee recipient address
  paramsAccount?: string | PublicKey;    // Params account address

  // Anchor Provider configuration
  commitment?: string;                   // Transaction confirmation level, e.g. 'confirmed'
  preflightCommitment?: string;          // Preflight confirmation level
  skipPreflight?: boolean;               // Whether to skip preflight, default false
  maxRetries?: number;                   // Maximum retry count

  // Debug configuration
  debugLogPath?: string;                 // Debug log path (Node.js only)
}
```

### Initialization Examples

#### Example 1: Using Preset Network Configuration

```javascript
const { Fun100xSdk, getDefaultOptions, FUN100X_PROGRAM_ID } = require('100x-sdk');
const { Connection } = require('@solana/web3.js');

// Get preset configuration
const options = getDefaultOptions('LOCALNET');  // 'MAINNET', 'DEVNET', 'LOCALNET'

// Create connection
const connection = new Connection(options.solanaEndpoint, 'confirmed');

// Initialize SDK
const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, options);
```

#### Example 2: Custom Configuration

```javascript
const customOptions = {
  defaultDataSource: 'fast',
  solanaEndpoint: 'https://api.mainnet-beta.solana.com',
  fastApiUrl: 'https://api.pinpet.io',
  feeRecipient: 'GesAj2dTn2wdNcxj4x8qsqS9aNRVPBPkE76aaqg7skxu',
  baseFeeRecipient: '5YHi1HsxobLiTD6NQfHJQpoPoRjMuNyXp4RroTvR6dKi',
  paramsAccount: '4yTBVZZQLiYi2p2xgwQXPb329z9jsQnhoPJyGmF3R4hb',
  commitment: 'confirmed',
  skipPreflight: false
};

const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, customOptions);
```

#### Example 3: Chain-Only Mode (No API)

```javascript
const chainOnlyOptions = {
  defaultDataSource: 'chain',
  solanaEndpoint: 'http://localhost:8899',
  feeRecipient: 'GesAj2dTn2wdNcxj4x8qsqS9aNRVPBPkE76aaqg7skxu',
  baseFeeRecipient: '5YHi1HsxobLiTD6NQfHJQpoPoRjMuNyXp4RroTvR6dKi',
  paramsAccount: '4yTBVZZQLiYi2p2xgwQXPb329z9jsQnhoPJyGmF3R4hb'
  // No fastApiUrl needed
};

const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, chainOnlyOptions);
```

## Instance Properties

### Core Properties

| Property | Type | Description |
|----------|------|-------------|
| `connection` | `Connection` | Solana connection instance |
| `programId` | `PublicKey` | 100x program ID |
| `program` | `Program` | Anchor program instance |
| `options` | `Object` | SDK configuration options |

### Configuration Properties

| Property | Type | Description |
|----------|------|-------------|
| `defaultDataSource` | `'fast' \| 'chain'` | Default data source |
| `feeRecipient` | `PublicKey` | Fee recipient account |
| `baseFeeRecipient` | `PublicKey` | Base fee recipient account |
| `paramsAccount` | `PublicKey` | Params account |
| `fastApiUrl` | `string` | API service address |
| `debugLogPath` | `string \| null` | Debug log path |

### Constant Properties

| Property | Type | Value | Description |
|----------|------|-------|-------------|
| `MAX_ORDERS_COUNT` | `number` | 9 | Maximum orders per transaction |
| `FIND_MAX_ORDERS_COUNT` | `number` | 1000 | Maximum order fetch count when searching |
| `SUGGEST_LIQ_RATIO` | `number` | 975 | Suggested liquidity usage ratio (97.5%) |

## Functional Modules

The SDK automatically initializes the following functional modules, accessible directly through the instance:

### Module List

| Module Property | Type | Description | Documentation |
|----------------|------|-------------|---------------|
| `sdk.trading` | `TradingModule` | Trading module | [TradingModule](./03-trading-module.md) |
| `sdk.fast` | `FastModule` | API data module | [FastModule](./04-fast-module.md) |
| `sdk.chain` | `ChainModule` | On-chain data module | [ChainModule](./05-chain-module.md) |
| `sdk.token` | `TokenModule` | Token module | [TokenModule](./06-token-module.md) |
| `sdk.param` | `ParamModule` | Parameter module | [ParamModule](./07-param-module.md) |
| `sdk.simulator` | `SimulatorModule` | Simulator module | [SimulatorModule](./08-simulator-module.md) |
| `sdk.data` | `DataInterface` | Unified data interface | See below |
| `sdk.curve` | `CurveAMM` | AMM utility class | [CurveAMM](./09-curve-amm-utility.md) |

### Module Usage Examples

```javascript
// Trading module
const buyResult = await sdk.trading.buy({...});

// API data module
const mintInfo = await sdk.fast.mint_info(mint);

// On-chain data module
const curveAccount = await sdk.chain.getCurveAccount(mint);

// Token module
const createResult = await sdk.token.create({...});

// Parameter module
const params = await sdk.param.getParams(partner);

// Simulator module
const simulation = await sdk.simulator.simulateTokenBuy(mint, amount);

// AMM utilities
const priceDecimal = sdk.curve.u128ToDecimal(priceU128);
```

## Unified Data Interface (sdk.data)

The unified data interface automatically routes to Fast or Chain modules based on `defaultDataSource` configuration.

### Interface Methods

#### orders() - Get Order Data

```javascript
sdk.data.orders(mint, options?)
```

**Parameters**:
- `mint` (string): Token address
- `options` (Object): Query parameters
  - `type` (string): Order type - `'up_orders'` (short) or `'down_orders'` (long)
  - `limit` (number): Items per page, default 500
  - `page` (number): Page number, default 1
  - `dataSource` (string): Temporarily specify data source - `'fast'` or `'chain'`

**Return**: `Promise<OrdersResponse>`

**Examples**:
```javascript
// Use default data source
const orders = await sdk.data.orders(mint, { type: 'down_orders' });

// Temporarily use on-chain data source
const orders = await sdk.data.orders(mint, {
  type: 'down_orders',
  dataSource: 'chain'
});
```

#### price() - Get Price Data

```javascript
sdk.data.price(mint, options?)
```

**Parameters**:
- `mint` (string): Token address
- `options` (Object): Query parameters
  - `dataSource` (string): Temporarily specify data source

**Return**: `Promise<string>` - Price string (u128 format)

**Example**:
```javascript
const price = await sdk.data.price(mint);
console.log('Current price:', price);
```

#### user_orders() - Get User Orders

```javascript
sdk.data.user_orders(user, mint, options?)
```

**Parameters**:
- `user` (string): User address
- `mint` (string): Token address
- `options` (Object): Query parameters
  - `page` (number): Page number
  - `limit` (number): Items per page
  - `order_by` (string): Sort order - `'start_time_desc'` or `'start_time_asc'`
  - `dataSource` (string): Temporarily specify data source

**Return**: `Promise<OrdersResponse>`

**Example**:
```javascript
const userOrders = await sdk.data.user_orders(user, mint, {
  page: 1,
  limit: 20,
  order_by: 'start_time_desc'
});
```

### Data Source Switching Examples

```javascript
// Global configuration uses fast
const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, {
  ...options,
  defaultDataSource: 'fast'
});

// Most queries automatically use fast
const orders1 = await sdk.data.orders(mint, { type: 'down_orders' });

// Important queries temporarily use chain
const orders2 = await sdk.data.orders(mint, {
  type: 'down_orders',
  dataSource: 'chain'
});

// Can also directly call specific modules
const orders3 = await sdk.fast.orders(mint, { type: 'down_orders' });
const orders4 = await sdk.chain.orders(mint, { type: 'down_orders' });
```

## Helper Functions

### getDefaultOptions()

Get preset network configurations.

```javascript
getDefaultOptions(networkName?)
```

**Parameters**:
- `networkName` (string): Network name - `'MAINNET'`, `'DEVNET'`, `'LOCALNET'`, default `'MAINNET'`

**Return**: `NetworkConfig`

**Examples**:
```javascript
const { getDefaultOptions } = require('100x-sdk');

const mainnetOptions = getDefaultOptions('MAINNET');
const devnetOptions = getDefaultOptions('DEVNET');
const localnetOptions = getDefaultOptions('LOCALNET');
```

**Return Structure**:
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

## Constant Exports

### FUN100X_PROGRAM_ID

100x program ID.

```javascript
const { FUN100X_PROGRAM_ID } = require('100x-sdk');
console.log(FUN100X_PROGRAM_ID);  // Program ID string
```

## Complete Examples

### Example 1: Basic Initialization and Usage

```javascript
const { Fun100xSdk, getDefaultOptions, FUN100X_PROGRAM_ID } = require('100x-sdk');
const { Connection } = require('@solana/web3.js');

async function main() {
  // 1. Get configuration
  const options = getDefaultOptions('MAINNET');

  // 2. Create connection
  const connection = new Connection(options.solanaEndpoint, 'confirmed');

  // 3. Initialize SDK
  const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, options);

  // 4. Access constants
  console.log('Max orders count:', sdk.MAX_ORDERS_COUNT);

  // 5. Use modules
  const mint = 'token-address';
  const price = await sdk.data.price(mint);
  console.log('Price:', price);
}

main().catch(console.error);
```

### Example 2: Data Source Comparison

```javascript
async function compareDataSources() {
  const mint = 'token-address';

  // Use fast data source
  console.time('Fast API');
  const fastOrders = await sdk.fast.orders(mint, { type: 'down_orders' });
  console.timeEnd('Fast API');

  // Use chain data source
  console.time('Chain Direct');
  const chainOrders = await sdk.chain.orders(mint, { type: 'down_orders' });
  console.timeEnd('Chain Direct');

  // Data comparison
  console.log('Fast order count:', fastOrders.data.total);
  console.log('Chain order count:', chainOrders.data.total);
}
```

### Example 3: Error Handling

```javascript
async function robustDataFetch(mint) {
  try {
    // Try using fast
    return await sdk.data.orders(mint, {
      type: 'down_orders',
      dataSource: 'fast'
    });
  } catch (fastError) {
    console.warn('Fast data source failed, switching to chain:', fastError.message);

    try {
      // Fallback to chain
      return await sdk.data.orders(mint, {
        type: 'down_orders',
        dataSource: 'chain'
      });
    } catch (chainError) {
      console.error('All data sources failed:', chainError.message);
      throw chainError;
    }
  }
}
```

## Notes

1. **Data Source Selection**:
   - `fast` suitable for general queries, fast but may have delays
   - `chain` suitable for important operations, more reliable but slower

2. **Configuration Validation**: SDK validates configuration completeness, missing required config throws errors

3. **Network Environment**: Different networks have different configurations, confirm environment before use

4. **Browser Compatibility**: debugLogPath only works in Node.js environment

## Related Documentation

- [Quick Start](./01-quick-start.md)
- [TradingModule](./03-trading-module.md)
- [Data Module Comparison](./04-fast-module.md)
- [CurveAMM Utility](./09-curve-amm-utility.md)
