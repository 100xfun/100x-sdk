# ParamModule Parameter Module Documentation

ParamModule is the module in the 100x SDK responsible for partner parameter management, used to create and manage partner fee parameter configurations.

## Module Overview

ParamModule provides complete lifecycle management of partner parameter accounts, including:

- Creating partner parameter accounts
- Querying partner parameter configurations
- Querying global administrator configuration
- Calculating PDA account addresses

### Purpose of Partner Parameters

The partner parameter system allows different partners to have independent fee configurations, including:

- **Trading Fee Rate** (`base_swap_fee`): Fee rate for spot buy/sell transactions
- **Borrow Fee Rate** (`base_borrow_fee`): Borrow rate for margin trading
- **Borrow Duration** (`base_borrow_duration`): Default duration for margin orders
- **Fee Recipient Account** (`fee_recipient`): Partner's fee receiving address
- **Fee Split Ratio** (`fee_split`): Fee distribution ratio between partner and platform

## Account Structure

### Admin Account

The Admin account is a globally unique administrator account that stores the system's default parameter configuration.

```typescript
interface Admin {
  default_swap_fee: number;        // Default trading fee rate (basis points, e.g., 30 = 0.3%)
  default_borrow_fee: number;      // Default borrow fee rate (basis points)
  default_borrow_duration: number; // Default borrow duration (seconds)
  base_fee_recipient: PublicKey;   // Base fee recipient address
  default_fee_split: number;       // Default fee split ratio (0-100)
  admin: PublicKey;                // Administrator address
  bump: number;                    // PDA bump seed
}
```

**PDA Calculation Rule**:
```javascript
seeds = ["admin"]
[adminAccount, bump] = PublicKey.findProgramAddressSync(
  [Buffer.from("admin")],
  programId
);
```

### Params Account

Each partner has an independent Params account storing that partner's customized parameters.

```typescript
interface Params {
  base_swap_fee: number;          // Trading fee rate (basis points)
  base_borrow_fee: number;        // Borrow fee rate (basis points)
  base_borrow_duration: number;   // Borrow duration (seconds)
  base_fee_recipient: PublicKey;  // Base fee recipient address
  fee_recipient: PublicKey;       // Partner fee recipient address
  fee_split: number;              // Fee split ratio (0-100)
  bump: number;                   // PDA bump seed
}
```

**PDA Calculation Rule**:
```javascript
seeds = ["params", partner_pubkey]
[paramsAccount, bump] = PublicKey.findProgramAddressSync(
  [Buffer.from("params"), partner.toBuffer()],
  programId
);
```

## API Methods

### createParams()

Create a partner parameter account.

```javascript
sdk.param.createParams({ partner })
```

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `partner` | `PublicKey` | Yes | Partner's public key address |

**Return Value**: `Promise<TransactionResult>`

```typescript
interface TransactionResult {
  transaction: Transaction;  // Unsigned transaction object
  signers: Keypair[];       // Additional signers (empty array for this method)
  accounts: {
    partner: PublicKey;         // Partner address
    adminAccount: PublicKey;    // Admin account address
    paramsAccount: PublicKey;   // Created Params account address
  }
}
```

**Description**:
- Partner account automatically pays for account creation fees
- Admin account must already exist (created during program initialization)
- Params account address is derived from partner address, ensuring uniqueness
- Created parameters will inherit default configuration from Admin account

**Example**:

```javascript
const { PublicKey } = require('@solana/web3.js');

// Partner address
const partner = new PublicKey('partner_public_key');

// Create parameter account
const result = await sdk.param.createParams({ partner });

console.log('Params account address:', result.accounts.paramsAccount.toString());

// Sign and send transaction
result.transaction.recentBlockhash = (
  await sdk.connection.getLatestBlockhash()
).blockhash;
result.transaction.feePayer = partner;

// Sign with partner wallet
const signed = await partnerWallet.signTransaction(result.transaction);
const txid = await sdk.connection.sendRawTransaction(signed.serialize());

console.log('Creation successful, transaction ID:', txid);
```

### getParams()

Query partner parameter account data.

```javascript
sdk.param.getParams(partner)
```

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `partner` | `PublicKey` | Yes | Partner public key |

**Return Value**: `Promise<Object>`

```typescript
interface ParamsResult {
  address: PublicKey;  // Params account address
  data: {
    base_swap_fee: number;
    base_borrow_fee: number;
    base_borrow_duration: number;
    base_fee_recipient: PublicKey;
    fee_recipient: PublicKey;
    fee_split: number;
    bump: number;
  }
}
```

**Exceptions**:
- If account doesn't exist, throws `Error: Partner parameters account does not exist`
- If on-chain query fails, throws relevant error message

**Example**:

```javascript
const { PublicKey } = require('@solana/web3.js');

const partner = new PublicKey('partner_public_key');

try {
  const params = await sdk.param.getParams(partner);

  console.log('Params account:', params.address.toString());
  console.log('Trading fee rate:', params.data.base_swap_fee / 100, '%');
  console.log('Borrow fee rate:', params.data.base_borrow_fee / 100, '%');
  console.log('Borrow duration:', params.data.base_borrow_duration, 'seconds');
  console.log('Fee recipient address:', params.data.fee_recipient.toString());
  console.log('Fee split ratio:', params.data.fee_split, '%');
} catch (error) {
  console.error('Query failed:', error.message);
}
```

### getAdmin()

Query global Admin account data.

```javascript
sdk.param.getAdmin()
```

**Parameters**: None

**Return Value**: `Promise<Object>`

```typescript
interface AdminResult {
  address: PublicKey;  // Admin account address
  data: {
    default_swap_fee: number;
    default_borrow_fee: number;
    default_borrow_duration: number;
    base_fee_recipient: PublicKey;
    default_fee_split: number;
    admin: PublicKey;
    bump: number;
  }
}
```

**Exceptions**:
- If account doesn't exist, throws `Error: Admin account does not exist`
- If on-chain query fails, throws relevant error message

**Example**:

```javascript
try {
  const admin = await sdk.param.getAdmin();

  console.log('Admin account:', admin.address.toString());
  console.log('Administrator address:', admin.data.admin.toString());
  console.log('Default trading fee rate:', admin.data.default_swap_fee / 100, '%');
  console.log('Default borrow fee rate:', admin.data.default_borrow_fee / 100, '%');
  console.log('Default borrow duration:', admin.data.default_borrow_duration, 'seconds');
  console.log('Base fee recipient address:', admin.data.base_fee_recipient.toString());
  console.log('Default fee split:', admin.data.default_fee_split, '%');
} catch (error) {
  console.error('Query failed:', error.message);
}
```

### getParamsAddress()

Calculate partner Params account PDA address (pure calculation, no on-chain query).

```javascript
sdk.param.getParamsAddress(partner)
```

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `partner` | `PublicKey` | Yes | Partner public key |

**Return Value**: `PublicKey` - Params account address

**Example**:

```javascript
const { PublicKey } = require('@solana/web3.js');

const partner = new PublicKey('partner_public_key');
const paramsAddress = sdk.param.getParamsAddress(partner);

console.log('Params account address:', paramsAddress.toString());
```

### getAdminAddress()

Calculate global Admin account PDA address (pure calculation, no on-chain query).

```javascript
sdk.param.getAdminAddress()
```

**Parameters**: None

**Return Value**: `PublicKey` - Admin account address

**Example**:

```javascript
const adminAddress = sdk.param.getAdminAddress();
console.log('Admin account address:', adminAddress.toString());
```

## PDA Calculation Rules Explained

### Admin Account PDA

The Admin account is globally unique, using the fixed seed `"admin"`.

```javascript
// Seed content
const seeds = [
  Buffer.from("admin")  // Fixed string "admin"
];

// Calculate PDA
const [adminAccount, bump] = PublicKey.findProgramAddressSync(
  seeds,
  programId
);

// Seed byte representation: [97, 100, 109, 105, 110]
// Corresponding ASCII: 'a', 'd', 'm', 'i', 'n'
```

### Params Account PDA

Each partner's Params account uses the partner's public key as part of the seed.

```javascript
// Seed content
const seeds = [
  Buffer.from("params"),    // Fixed string "params"
  partner.toBuffer()        // Partner public key's 32 bytes
];

// Calculate PDA
const [paramsAccount, bump] = PublicKey.findProgramAddressSync(
  seeds,
  programId
);

// "params" byte representation: [112, 97, 114, 97, 109, 115]
// Corresponding ASCII: 'p', 'a', 'r', 'a', 'm', 's'
```

**Characteristics**:
- Each partner can only have one Params account (address derived from public key)
- Different partners have different Params account addresses
- Addresses can be calculated offline without querying on-chain data

## Use Cases

### Scenario 1: Create New Partner

```javascript
const { PublicKey, Keypair } = require('@solana/web3.js');
const { Fun100xSdk, getDefaultOptions, FUN100X_PROGRAM_ID } = require('100x-sdk');
const { Connection } = require('@solana/web3.js');

async function createPartner() {
  // Initialize SDK
  const options = getDefaultOptions('MAINNET');
  const connection = new Connection(options.solanaEndpoint, 'confirmed');
  const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, options);

  // Partner wallet
  const partnerKeypair = Keypair.generate();
  console.log('New partner address:', partnerKeypair.publicKey.toString());

  // Calculate Params account address to be created
  const paramsAddress = sdk.param.getParamsAddress(partnerKeypair.publicKey);
  console.log('Params account address:', paramsAddress.toString());

  // Create Params account
  const result = await sdk.param.createParams({
    partner: partnerKeypair.publicKey
  });

  // Sign and send
  result.transaction.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;
  result.transaction.feePayer = partnerKeypair.publicKey;
  result.transaction.sign(partnerKeypair);

  const txid = await connection.sendRawTransaction(
    result.transaction.serialize()
  );

  console.log('Creation successful, transaction ID:', txid);

  // Query after confirmation
  await connection.confirmTransaction(txid);
  const params = await sdk.param.getParams(partnerKeypair.publicKey);
  console.log('Parameter configuration:', params.data);
}

createPartner().catch(console.error);
```

### Scenario 2: Query and Use Partner Configuration

```javascript
async function usePartnerConfig(partnerAddress) {
  // Query partner parameters
  const params = await sdk.param.getParams(new PublicKey(partnerAddress));

  // Use parameters to configure transactions
  console.log('Using partner configuration:');
  console.log('- Fee recipient address:', params.data.fee_recipient.toString());
  console.log('- Trading fee rate:', params.data.base_swap_fee / 100, '%');
  console.log('- Fee split:', params.data.fee_split, '%');

  // These parameters can be used in transactions
  // For example, use fee_recipient as the transaction's fee receiving account
}
```

### Scenario 3: Compare Partner and Default Configuration

```javascript
async function compareConfigs(partnerAddress) {
  // Query Admin default configuration
  const admin = await sdk.param.getAdmin();

  // Query partner configuration
  const params = await sdk.param.getParams(new PublicKey(partnerAddress));

  console.log('Configuration comparison:');
  console.log('='.repeat(60));

  console.log('Trading fee rate:');
  console.log('  Default:', admin.data.default_swap_fee / 100, '%');
  console.log('  Partner:', params.data.base_swap_fee / 100, '%');

  console.log('Borrow fee rate:');
  console.log('  Default:', admin.data.default_borrow_fee / 100, '%');
  console.log('  Partner:', params.data.base_borrow_fee / 100, '%');

  console.log('Borrow duration:');
  console.log('  Default:', admin.data.default_borrow_duration, 'seconds');
  console.log('  Partner:', params.data.base_borrow_duration, 'seconds');

  console.log('Fee split:');
  console.log('  Default:', admin.data.default_fee_split, '%');
  console.log('  Partner:', params.data.fee_split, '%');
}
```

### Scenario 4: Batch Query Multiple Partners

```javascript
async function queryMultiplePartners(partnerAddresses) {
  const results = await Promise.all(
    partnerAddresses.map(async (address) => {
      try {
        const params = await sdk.param.getParams(new PublicKey(address));
        return {
          partner: address,
          success: true,
          params: params.data
        };
      } catch (error) {
        return {
          partner: address,
          success: false,
          error: error.message
        };
      }
    })
  );

  // Print results
  results.forEach((result) => {
    console.log('\nPartner:', result.partner);
    if (result.success) {
      console.log('  Trading fee rate:', result.params.base_swap_fee / 100, '%');
      console.log('  Borrow fee rate:', result.params.base_borrow_fee / 100, '%');
      console.log('  Fee recipient:', result.params.fee_recipient.toString());
    } else {
      console.log('  Query failed:', result.error);
    }
  });
}

// Usage example
const partners = [
  'Partner1PublicKey',
  'Partner2PublicKey',
  'Partner3PublicKey'
];
queryMultiplePartners(partners).catch(console.error);
```

### Scenario 5: Offline Address Calculation

```javascript
const { PublicKey } = require('@solana/web3.js');
const { FUN100X_PROGRAM_ID } = require('100x-sdk');

// No need to initialize SDK or connect to network
function calculateAddressesOffline(partnerPublicKey) {
  const programId = new PublicKey(FUN100X_PROGRAM_ID);

  // Calculate Admin address
  const [adminAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin")],
    programId
  );

  // Calculate Params address
  const [paramsAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("params"), new PublicKey(partnerPublicKey).toBuffer()],
    programId
  );

  return {
    admin: adminAddress.toString(),
    params: paramsAddress.toString()
  };
}

// Offline usage
const addresses = calculateAddressesOffline('partner_public_key');
console.log('Admin account:', addresses.admin);
console.log('Params account:', addresses.params);
```

## Complete Example

### Example: Complete Partner Management Flow

```javascript
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Fun100xSdk, getDefaultOptions, FUN100X_PROGRAM_ID } = require('100x-sdk');

async function partnerManagementFlow() {
  // 1. Initialize SDK
  const options = getDefaultOptions('MAINNET');
  const connection = new Connection(options.solanaEndpoint, 'confirmed');
  const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, options);

  console.log('=== Step 1: Query Global Configuration ===');
  const admin = await sdk.param.getAdmin();
  console.log('Admin address:', admin.address.toString());
  console.log('Default trading fee rate:', admin.data.default_swap_fee / 100, '%');
  console.log('Default borrow fee rate:', admin.data.default_borrow_fee / 100, '%');

  // 2. Prepare partner
  console.log('\n=== Step 2: Prepare Partner ===');
  const partnerKeypair = Keypair.generate();
  console.log('Partner address:', partnerKeypair.publicKey.toString());

  // 3. Pre-calculate Params address
  console.log('\n=== Step 3: Calculate Params Account Address ===');
  const paramsAddress = sdk.param.getParamsAddress(partnerKeypair.publicKey);
  console.log('Params account:', paramsAddress.toString());

  // 4. Create Params account
  console.log('\n=== Step 4: Create Params Account ===');
  const createResult = await sdk.param.createParams({
    partner: partnerKeypair.publicKey
  });

  // Prepare transaction
  const { blockhash } = await connection.getLatestBlockhash();
  createResult.transaction.recentBlockhash = blockhash;
  createResult.transaction.feePayer = partnerKeypair.publicKey;

  // Sign and send
  createResult.transaction.sign(partnerKeypair);
  const createTxid = await connection.sendRawTransaction(
    createResult.transaction.serialize(),
    { skipPreflight: false }
  );

  console.log('Creation transaction sent:', createTxid);

  // Wait for confirmation
  console.log('Waiting for transaction confirmation...');
  await connection.confirmTransaction(createTxid);
  console.log('Transaction confirmed');

  // 5. Query created parameters
  console.log('\n=== Step 5: Query Created Parameters ===');
  const params = await sdk.param.getParams(partnerKeypair.publicKey);
  console.log('Params account address:', params.address.toString());
  console.log('Parameter configuration:');
  console.log('  Trading fee rate:', params.data.base_swap_fee / 100, '%');
  console.log('  Borrow fee rate:', params.data.base_borrow_fee / 100, '%');
  console.log('  Borrow duration:', params.data.base_borrow_duration, 'seconds');
  console.log('  Base fee recipient:', params.data.base_fee_recipient.toString());
  console.log('  Partner fee recipient:', params.data.fee_recipient.toString());
  console.log('  Fee split ratio:', params.data.fee_split, '%');

  // 6. Validate addresses
  console.log('\n=== Step 6: Validation ===');
  console.log('Pre-calculated address matches:', paramsAddress.equals(params.address));
  console.log('Returned address matches:', createResult.accounts.paramsAccount.equals(params.address));

  console.log('\n=== Flow Complete ===');
}

partnerManagementFlow().catch(console.error);
```

## Notes

### 1. Account Creation Permissions

- Only the partner themselves (with private key) can create their own Params account
- Transaction must be signed by partner when creating
- Creation fees are paid by partner account

### 2. Admin Account

- Admin account is created during program initialization, regular users cannot create it
- Admin account stores global default configuration
- Newly created Params accounts inherit default configuration from Admin

### 3. PDA Address Uniqueness

- Each partner can only have one Params account
- Repeatedly calling `createParams` will fail (account already exists)
- Can use `getParamsAddress` to check if account exists beforehand

### 4. Parameter Immutability

- Params account parameters created through SDK cannot be modified after creation
- If parameter modification is needed, the program must provide corresponding update instructions (SDK may need extension)

### 5. Fee Calculation

- `base_swap_fee` and `base_borrow_fee` use basis points (1 basis point = 0.01%)
- For example: `30` represents a 0.3% fee rate
- `fee_split` represents the percentage of fees the partner receives (0-100)

### 6. Data Queries

- `getParams` and `getAdmin` require on-chain queries, need network connection
- `getParamsAddress` and `getAdminAddress` are pure calculations, can be used offline
- Querying non-existent accounts throws exceptions, recommended to use try-catch

## TypeScript Type Definitions

```typescript
import { PublicKey, Transaction, Keypair } from '@solana/web3.js';

interface ParamModule {
  // Create partner parameters
  createParams(params: { partner: PublicKey }): Promise<{
    transaction: Transaction;
    signers: Keypair[];
    accounts: {
      partner: PublicKey;
      adminAccount: PublicKey;
      paramsAccount: PublicKey;
    };
  }>;

  // Query partner parameters
  getParams(partner: PublicKey): Promise<{
    address: PublicKey;
    data: {
      base_swap_fee: number;
      base_borrow_fee: number;
      base_borrow_duration: number;
      base_fee_recipient: PublicKey;
      fee_recipient: PublicKey;
      fee_split: number;
      bump: number;
    };
  }>;

  // Query Admin account
  getAdmin(): Promise<{
    address: PublicKey;
    data: {
      default_swap_fee: number;
      default_borrow_fee: number;
      default_borrow_duration: number;
      base_fee_recipient: PublicKey;
      default_fee_split: number;
      admin: PublicKey;
      bump: number;
    };
  }>;

  // Calculate Params account address
  getParamsAddress(partner: PublicKey): PublicKey;

  // Calculate Admin account address
  getAdminAddress(): PublicKey;
}
```

## Error Handling

### Common Errors and Handling

```javascript
async function robustParamsQuery(partnerAddress) {
  try {
    // First validate address format
    let partner;
    try {
      partner = new PublicKey(partnerAddress);
    } catch (error) {
      throw new Error(`Invalid public key format: ${partnerAddress}`);
    }

    // Query parameters
    const params = await sdk.param.getParams(partner);
    return params;

  } catch (error) {
    if (error.message.includes('does not exist')) {
      console.error('Params account doesn\'t exist, may need to create first');
      // Can choose to create account
      // const createResult = await sdk.param.createParams({ partner });
    } else if (error.message.includes('Invalid public key')) {
      console.error('Public key format error');
    } else {
      console.error('Query failed:', error.message);
    }
    throw error;
  }
}
```

## Related Documentation

- [Fun100xSdk Main Class](./02-100x-sdk-main-class.md)
- [TradingModule Trading Module](./03-trading-module.md)
- [Quick Start](./01-quick-start.md)
