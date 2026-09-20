# TokenModule - Token Module

TokenModule is the core module in the 100x SDK responsible for token creation and management. It provides complete functionality for creating new tokens on the 100x protocol, including Metaplex metadata setup, liquidity pool initialization, orderbook creation, and more.

## Module Overview

TokenModule provides the following main features:

1. **create()** - Create a new token
2. **createAndBuy()** - Create a token and immediately purchase it (integrated operation)

When creating a token, the following on-chain accounts are automatically initialized:
- Borrowing curve account (borrowing_curve)
- Liquidity pool token account (pool_token)
- Liquidity pool SOL account (pool_sol)
- Long orderbook (up_orderbook)
- Short orderbook (down_orderbook)
- Metaplex metadata account (metadata)

## Accessing the Module

Access through SDK instance:

```javascript
const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, options);

// Using the token module
await sdk.token.create({...});
await sdk.token.createAndBuy({...});
```

---

## create() - Create a New Token

Creates a new 100x protocol token, including all required on-chain accounts and Metaplex metadata.

### Method Signature

```typescript
async create(params: {
  mint: Keypair,           // Token mint keypair
  name: string,            // Token name
  symbol: string,          // Token symbol
  uri: string,             // Metadata URI
  payer: PublicKey         // Creator public key (payer)
}): Promise<TransactionResult>
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mint` | `Keypair` | Yes | Token mint keypair, required as a signer |
| `name` | `string` | Yes | Token name, will be stored in Metaplex metadata |
| `symbol` | `string` | Yes | Token symbol (e.g., "SPIN", "DOGE"), max 10 characters |
| `uri` | `string` | Yes | URI of the metadata JSON file (usually IPFS or Arweave link) |
| `payer` | `PublicKey` | Yes | Creator's public key, pays the creation fee |

### Return Value

```typescript
{
  transaction: Transaction,  // Unsigned transaction object
  signers: [mint],          // Array of additional signers (includes mint)
  accounts: {               // Addresses of related accounts
    mint: PublicKey,               // Token mint address
    curveAccount: PublicKey,       // Borrowing curve account
    poolTokenAccount: PublicKey,   // Liquidity pool token account
    poolSolAccount: PublicKey,     // Liquidity pool SOL account
    upOrderbook: PublicKey,        // Long orderbook
    downOrderbook: PublicKey,      // Short orderbook
    metadataAccount: PublicKey,    // Metaplex metadata account
    payer: PublicKey              // Payer address
  }
}
```

### Complete Example

```javascript
const { Connection, Keypair } = require('@solana/web3.js');
const { Fun100xSdk, getDefaultOptions, FUN100X_PROGRAM_ID } = require('100x-sdk');

async function createNewToken() {
  // 1. Initialize SDK
  const options = getDefaultOptions('LOCALNET');
  const connection = new Connection(options.solanaEndpoint, 'confirmed');
  const wallet = Keypair.fromSecretKey(/* your wallet private key */);

  const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, {
    ...options,
    // Note: paramsAccount must be configured, otherwise an error will be thrown
    paramsAccount: 'YourParamsAccountAddress'
  });

  // 2. Generate new mint keypair
  const mintKeypair = Keypair.generate();
  console.log('New token address:', mintKeypair.publicKey.toString());

  // 3. Prepare metadata URI
  // Metadata JSON should already be uploaded to IPFS/Arweave
  const metadataUri = 'https://arweave.net/your-metadata-hash';

  // 4. Call create method
  const result = await sdk.token.create({
    mint: mintKeypair,                // Keypair object
    name: '100x Dog',             // Token name
    symbol: 'SDOG',                  // Token symbol
    uri: metadataUri,                // Metadata URI
    payer: wallet.publicKey          // Payer public key
  });

  // 5. Set transaction parameters
  result.transaction.feePayer = wallet.publicKey;
  result.transaction.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;

  // 6. Sign additional signers (mint keypair)
  if (result.signers.length > 0) {
    result.transaction.partialSign(...result.signers);
  }

  // 7. Wallet sign and send
  result.transaction.sign(wallet);
  const signature = await connection.sendRawTransaction(
    result.transaction.serialize()
  );

  // 8. Confirm transaction
  await connection.confirmTransaction(signature, 'confirmed');

  console.log('Token created successfully!');
  console.log('Transaction signature:', signature);
  console.log('Token Mint:', result.accounts.mint.toString());
  console.log('Borrowing curve account:', result.accounts.curveAccount.toString());
  console.log('Metadata account:', result.accounts.metadataAccount.toString());

  return result;
}

createNewToken().catch(console.error);
```

### Using in Browser Environment

```javascript
import { Fun100xSdk } from '100x-sdk';
import { Keypair } from '@solana/web3.js';

async function createTokenInBrowser() {
  // Assuming wallet is already connected (e.g., Phantom)
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const wallet = window.solana; // Phantom wallet

  const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, {
    defaultDataSource: 'fast',
    paramsAccount: 'YourParamsAccountAddress'
  });

  // Generate new mint
  const mintKeypair = Keypair.generate();

  // Create token
  const result = await sdk.token.create({
    mint: mintKeypair,
    name: 'My Token',
    symbol: 'MTK',
    uri: 'https://arweave.net/metadata',
    payer: wallet.publicKey
  });

  // Set transaction parameters
  result.transaction.feePayer = wallet.publicKey;
  result.transaction.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;

  // Mint signature
  if (result.signers.length > 0) {
    result.transaction.partialSign(...result.signers);
  }

  // Wallet sign and send
  const signature = await wallet.signAndSendTransaction(result.transaction);
  await connection.confirmTransaction(signature);

  console.log('Token created successfully:', signature);
  return result;
}
```

---

## createAndBuy() - Create and Buy Token

An integrated method that combines token creation and initial purchase into a single transaction. This saves transaction fees and requires only one signature.

### Method Signature

```typescript
async createAndBuy(params: {
  mint: Keypair,           // Token mint keypair
  name: string,            // Token name
  symbol: string,          // Token symbol
  uri: string,             // Metadata URI
  payer: PublicKey,        // Creator public key (payer)
  buyTokenAmount: BN,      // Purchase token amount
  maxSolAmount: BN         // Maximum SOL to spend
}, options?: {
  computeUnits?: number    // Compute unit limit, default 1800000
}): Promise<TransactionResult>
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mint` | `Keypair` | Yes | Token mint keypair |
| `name` | `string` | Yes | Token name |
| `symbol` | `string` | Yes | Token symbol |
| `uri` | `string` | Yes | Metadata URI |
| `payer` | `PublicKey` | Yes | Creator public key |
| `buyTokenAmount` | `anchor.BN` | Yes | Amount of tokens to purchase (6 decimals) |
| `maxSolAmount` | `anchor.BN` | Yes | Maximum SOL willing to pay (9 decimals) |
| `options.computeUnits` | `number` | No | Compute unit limit, default 1800000 |

### Return Value

```typescript
{
  transaction: Transaction,  // Unsigned transaction object
  signers: [mint],          // Additional signers required
  accounts: {               // All related account addresses
    // create related accounts
    mint: PublicKey,
    curveAccount: PublicKey,
    poolTokenAccount: PublicKey,
    poolSolAccount: PublicKey,
    upOrderbook: PublicKey,
    downOrderbook: PublicKey,
    metadataAccount: PublicKey,
    payer: PublicKey,
    // buy related accounts
    userTokenAccount: PublicKey,      // User token account (ATA)
    cooldown: PublicKey,              // Trade cooldown PDA
    feeRecipientAccount: PublicKey,   // Partner fee recipient account
    baseFeeRecipientAccount: PublicKey // Base fee recipient account
  }
}
```

### Complete Example

```javascript
const { Connection, Keypair } = require('@solana/web3.js');
const { Fun100xSdk, getDefaultOptions, FUN100X_PROGRAM_ID } = require('100x-sdk');
const anchor = require('@coral-xyz/anchor');

async function createAndBuyToken() {
  // 1. Initialize SDK
  const options = getDefaultOptions('LOCALNET');
  const connection = new Connection(options.solanaEndpoint, 'confirmed');
  const wallet = Keypair.fromSecretKey(/* your wallet private key */);

  const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, {
    ...options,
    // These parameters must be configured
    paramsAccount: 'YourParamsAccountAddress',
    feeRecipient: 'PartnerFeeRecipientAddress',
    baseFeeRecipient: 'BaseFeeRecipientAddress'
  });

  // 2. Generate new mint keypair
  const mintKeypair = Keypair.generate();
  console.log('New token address:', mintKeypair.publicKey.toString());

  // 3. Prepare purchase parameters
  const buyTokenAmount = new anchor.BN('10000000');    // Buy 10 tokens (6 decimals)
  const maxSolAmount = new anchor.BN('5000000000');    // Max spend 5 SOL (9 decimals)

  // 4. Call createAndBuy method
  const result = await sdk.token.createAndBuy({
    mint: mintKeypair,
    name: '100x Dog',
    symbol: 'SDOG',
    uri: 'https://arweave.net/your-metadata-hash',
    payer: wallet.publicKey,
    buyTokenAmount: buyTokenAmount,
    maxSolAmount: maxSolAmount
  }, {
    computeUnits: 1800000  // Optional: custom compute units
  });

  console.log('Transaction includes instructions:', result.transaction.instructions.length);
  console.log('- Compute unit setup');
  console.log('- Create token');
  console.log('- Create user token account (if needed)');
  console.log('- Buy token');

  // 5. Set transaction parameters
  result.transaction.feePayer = wallet.publicKey;
  result.transaction.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;

  // 6. Sign mint keypair
  if (result.signers.length > 0) {
    result.transaction.partialSign(...result.signers);
  }

  // 7. Wallet sign and send
  result.transaction.sign(wallet);
  const signature = await connection.sendRawTransaction(
    result.transaction.serialize()
  );

  // 8. Confirm transaction
  await connection.confirmTransaction(signature, 'confirmed');

  console.log('Token created and purchased successfully!');
  console.log('Transaction signature:', signature);
  console.log('Token Mint:', result.accounts.mint.toString());
  console.log('User token account:', result.accounts.userTokenAccount.toString());

  // 9. Query balance after purchase
  const tokenBalance = await connection.getTokenAccountBalance(
    result.accounts.userTokenAccount
  );
  console.log('Token balance after purchase:', tokenBalance.value.uiAmount);

  return result;
}

createAndBuyToken().catch(console.error);
```

### Advantages of createAndBuy

1. **Saves Transaction Fees** - Combines two operations into one transaction, only pays one transaction fee
2. **Simplifies Operation** - Users only need to sign once
3. **Atomicity Guarantee** - Creation and purchase either both succeed or both fail
4. **First-mover Advantage** - Creator can immediately obtain tokens, suitable for token issuance scenarios

---

## Metaplex Metadata Specification

### Metadata JSON Format

Token metadata needs to be uploaded to decentralized storage (IPFS or Arweave) with the following JSON format:

```json
{
  "name": "100x Dog",
  "symbol": "SDOG",
  "description": "A cute 100x protocol token",
  "image": "https://arweave.net/image-hash.png",
  "external_url": "https://yourproject.com",
  "attributes": [
    {
      "trait_type": "Category",
      "value": "Meme"
    },
    {
      "trait_type": "Rarity",
      "value": "Common"
    }
  ],
  "properties": {
    "files": [
      {
        "uri": "https://arweave.net/image-hash.png",
        "type": "image/png"
      }
    ],
    "category": "image"
  }
}
```

### Metadata Field Descriptions

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Token name, displayed in wallets and NFT marketplaces |
| `symbol` | Yes | Token symbol |
| `description` | Recommended | Token description |
| `image` | Recommended | Token icon URI |
| `external_url` | No | Project website link |
| `attributes` | No | Token attributes array |
| `properties` | Recommended | Additional properties, including file list |

### Example of Uploading Metadata to Arweave

```javascript
// Using Bundlr Network to upload to Arweave
const Bundlr = require('@bundlr-network/client');

async function uploadMetadata() {
  // Initialize Bundlr client
  const bundlr = new Bundlr(
    'https://node1.bundlr.network',
    'solana',
    walletPrivateKey,
    { providerUrl: 'https://api.mainnet-beta.solana.com' }
  );

  // Prepare metadata
  const metadata = {
    name: '100x Dog',
    symbol: 'SDOG',
    description: 'A cute 100x protocol token',
    image: 'https://arweave.net/image-hash.png',
    attributes: [
      { trait_type: 'Category', value: 'Meme' }
    ]
  };

  // Upload metadata
  const tx = await bundlr.upload(JSON.stringify(metadata), {
    tags: [{ name: 'Content-Type', value: 'application/json' }]
  });

  const metadataUri = `https://arweave.net/${tx.id}`;
  console.log('Metadata URI:', metadataUri);

  return metadataUri;
}
```

---

## PDA Account Calculation

TokenModule automatically calculates the following PDA (Program Derived Address) accounts when creating a token:

### 1. Borrowing Curve Account (borrowing_curve)

Stores the token's AMM curve parameters and liquidity pool state.

```javascript
const [curveAccount] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("borrowing_curve"),
    mint.publicKey.toBuffer(),
  ],
  programId
);
```

### 2. Pool Token Account (pool_token)

Stores the liquidity pool's token reserves.

```javascript
const [poolTokenAccount] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("pool_token"),
    mint.publicKey.toBuffer(),
  ],
  programId
);
```

### 3. Pool SOL Account (pool_sol)

Stores the liquidity pool's SOL reserves.

```javascript
const [poolSolAccount] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("pool_sol"),
    mint.publicKey.toBuffer(),
  ],
  programId
);
```

### 4. Long Orderbook (up_orderbook)

Manages the linked list structure of all long orders.

```javascript
const [upOrderbook] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("up_orderbook"),
    mint.publicKey.toBuffer(),
  ],
  programId
);
```

### 5. Short Orderbook (down_orderbook)

Manages the linked list structure of all short orders.

```javascript
const [downOrderbook] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("down_orderbook"),
    mint.publicKey.toBuffer(),
  ],
  programId
);
```

### 6. Metaplex Metadata Account (metadata)

Stores the token's Metaplex standard metadata.

```javascript
const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

const [metadataAccount] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("metadata"),
    METADATA_PROGRAM_ID.toBuffer(),
    mint.publicKey.toBuffer(),
  ],
  METADATA_PROGRAM_ID
);
```

### 7. Trade Cooldown PDA (trade_cooldown) - createAndBuy Specific

Used for cooldown mechanism to prevent rapid repeated trades.

```javascript
const [cooldownPDA] = PublicKey.findProgramAddressSync(
  [
    Buffer.from('trade_cooldown'),
    mint.publicKey.toBuffer(),
    payer.toBuffer()
  ],
  programId
);
```

---

## Important Notes

### 1. paramsAccount Configuration Requirement

**Must** configure `paramsAccount` when creating tokens, otherwise an error will be thrown:

```javascript
// ❌ Wrong: paramsAccount not configured
const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, options);

// ✅ Correct: Configure paramsAccount
const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, {
  ...options,
  paramsAccount: 'YourParamsAccountAddress'
});
```

**Why is paramsAccount needed?**
- Stores partner parameters (fee ratio, recipient addresses, etc.)
- Smart contract needs to verify partner identity
- Ensures correct fee distribution

### 2. mint Parameter Must be a Keypair

The `mint` parameter must be a `Keypair` object, not a `PublicKey`:

```javascript
// ❌ Wrong: Using PublicKey
const mint = new PublicKey('...');
await sdk.token.create({ mint, ... });

// ✅ Correct: Using Keypair
const mint = Keypair.generate();
await sdk.token.create({ mint, ... });
```

### 3. Purpose of signers Array

The returned `signers` array contains keypairs that need additional signatures:

```javascript
const result = await sdk.token.create({...});

// mint keypair is in signers array
console.log(result.signers);  // [mintKeypair]

// Must partially sign the transaction
if (result.signers.length > 0) {
  result.transaction.partialSign(...result.signers);
}
```

**Why does mint need to be a signer?**
- Solana requires mint account initialization to be signed by the mint's keypair
- Ensures only those with the private key can create that mint address

### 4. Additional Configuration for createAndBuy

When using `createAndBuy`, additional fee recipient accounts need to be configured:

```javascript
const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, {
  ...options,
  paramsAccount: 'YourParamsAccountAddress',
  feeRecipient: 'PartnerFeeRecipientAddress',      // Required
  baseFeeRecipient: 'BaseFeeRecipientAddress'      // Required
});
```

### 5. Compute Unit Settings

- `create()` defaults to **400,000** compute units
- `createAndBuy()` defaults to **1,800,000** compute units (includes multiple operations)

Can be customized via `options.computeUnits`:

```javascript
await sdk.token.createAndBuy({...}, {
  computeUnits: 2000000  // Increase compute units
});
```

### 6. Metadata URI Must be Prepared in Advance

Before calling `create`, metadata JSON must already be uploaded to decentralized storage:

```javascript
// 1. First upload metadata to IPFS/Arweave
const metadataUri = await uploadToArweave(metadata);

// 2. Then create token
await sdk.token.create({
  uri: metadataUri,  // Use uploaded URI
  ...
});
```

### 7. User Token Account (ATA) Auto-Creation

`createAndBuy` automatically checks if the user's token account exists:

- **Does not exist**: Automatically adds instruction to create ATA
- **Already exists**: Skips creation, proceeds directly to purchase

```javascript
// SDK internal logic
const userTokenAccountInfo = await connection.getAccountInfo(userTokenAccount);
if (userTokenAccountInfo === null) {
  // Automatically add create ATA instruction
  transaction.add(createAssociatedTokenAccountInstruction(...));
}
```

### 8. Common Transaction Failure Causes

| Error Message | Cause | Solution |
|--------------|-------|----------|
| `SDK paramsAccount not configured` | paramsAccount not configured | Pass `paramsAccount` when initializing SDK |
| `Fee recipient accounts not configured` | Fee accounts not configured | Pass `feeRecipient` and `baseFeeRecipient` |
| `Insufficient SOL` | Insufficient SOL balance | Ensure wallet has enough SOL to pay creation fees and purchase |
| `Invalid metadata URI` | Metadata URI inaccessible | Check if metadata was successfully uploaded |
| `Compute budget exceeded` | Insufficient compute units | Increase `computeUnits` parameter |

---

## Quick Reference

### create() Minimal Example

```javascript
const mintKeypair = Keypair.generate();

const result = await sdk.token.create({
  mint: mintKeypair,
  name: 'My Token',
  symbol: 'MTK',
  uri: 'https://arweave.net/metadata',
  payer: wallet.publicKey
});

result.transaction.feePayer = wallet.publicKey;
result.transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
result.transaction.partialSign(...result.signers);
result.transaction.sign(wallet);

const signature = await connection.sendRawTransaction(result.transaction.serialize());
await connection.confirmTransaction(signature);
```

### createAndBuy() Minimal Example

```javascript
const mintKeypair = Keypair.generate();

const result = await sdk.token.createAndBuy({
  mint: mintKeypair,
  name: 'My Token',
  symbol: 'MTK',
  uri: 'https://arweave.net/metadata',
  payer: wallet.publicKey,
  buyTokenAmount: new anchor.BN('1000000'),    // 1 token
  maxSolAmount: new anchor.BN('1000000000')    // 1 SOL
});

result.transaction.feePayer = wallet.publicKey;
result.transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
result.transaction.partialSign(...result.signers);
result.transaction.sign(wallet);

const signature = await connection.sendRawTransaction(result.transaction.serialize());
await connection.confirmTransaction(signature);
```

---

## Related Documentation

- [Fun100xSdk Main Class](./02-pinpetsdk-main-class.md) - SDK initialization and configuration
- [TradingModule](./03-trading-module.md) - Buy/sell trading operations
- [ParamModule](./07-param-module.md) - Partner parameter management
- [Quick Start](./01-quick-start.md) - SDK basic usage guide
