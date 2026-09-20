# ToolsModule Utility Module

## Overview

`ToolsModule` provides trading utility functions, including approving trades, closing Cooldown PDAs, and validating Cooldown status.

## Access Method

```javascript
const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, options);

// Access via sdk.tools
const result = await sdk.tools.approveTrade({...});
```

## Core Methods

### 1. approveTrade - Approve Trade

Approve the current token balance for trading, creating or updating the TradeCooldown PDA.

#### Use Cases

1. After receiving tokens from another address, wanting to trade immediately
2. Reactivating the cooldown PDA
3. User token balance increased, need to update approval_token_amount

#### Method Signature

```javascript
async approveTrade(params: {
  mint: PublicKey | string,    // Token address
  wallet: Keypair              // User wallet (for signing)
}): Promise<TransactionResult>
```

#### Return Value

```typescript
{
  transaction: Transaction,    // Unsigned transaction
  signers: Keypair[],         // Additional signers (usually empty)
  accounts: {
    payer: PublicKey,
    mintAccount: PublicKey,
    curveAccount: PublicKey,
    userTokenAccount: PublicKey,
    cooldown: PublicKey
  }
}
```

#### Usage Example

```javascript
const result = await sdk.tools.approveTrade({
  mint: '4EasVvA1S6ytNpP1TDLBCPWHNLgd9sFnjWn4Wqo7wk83',
  wallet: userKeypair
});

// Sign and send transaction
const signature = await sdk.connection.sendTransaction(
  result.transaction,
  [wallet]
);

await sdk.connection.confirmTransaction(signature);
```

---

### 2. closeTradeCooldown - Close Cooldown PDA

Manually close the TradeCooldown PDA and recover rent.

#### Use Cases

1. User wants to recover rent
2. Clean up unused PDAs
3. Admin batch cleanup of expired PDAs

#### Notes

- Can only close your own PDA (verified through seeds)
- No need to verify token balance, can recreate via `approveTrade` after closing
- After PDA is closed, next buy or approve call will automatically recreate it

#### Method Signature

```javascript
async closeTradeCooldown(params: {
  mint: PublicKey | string,    // Token address
  wallet: Keypair              // User wallet (for signing)
}): Promise<TransactionResult>
```

#### Return Value

```typescript
{
  transaction: Transaction,
  signers: Keypair[],
  accounts: {
    payer: PublicKey,
    mintAccount: PublicKey,
    userTokenAccount: PublicKey,
    cooldown: PublicKey
  },
  cooldownInfo: {
    lastTradeTime: number,          // Unix timestamp
    approvalTokenAmount: BN,        // Approved token amount
    bump: number                    // PDA bump
  }
}
```

#### Usage Example

```javascript
const result = await sdk.tools.closeTradeCooldown({
  mint: '4EasVvA1S6ytNpP1TDLBCPWHNLgd9sFnjWn4Wqo7wk83',
  wallet: userKeypair
});

console.log('Cooldown PDA info:');
console.log('  Last trade time:', result.cooldownInfo.lastTradeTime);
console.log('  Approved amount:', result.cooldownInfo.approvalTokenAmount.toString());

// Sign and send transaction
const signature = await sdk.connection.sendTransaction(
  result.transaction,
  [wallet]
);
```

---

### 3. validateCooldown - Validate Cooldown Status

Validate whether the Cooldown PDA's `approval_token_amount` is greater than or equal to the user's current token balance.

#### Use Cases

1. Verify before trading that the Cooldown PDA is synced with user token balance
2. Check if user needs to call `approveTrade` after receiving tokens
3. Security check to validate cooldown status

#### Validation Logic

- ✅ **Pass**: `approval_token_amount >= current token balance`
- ❌ **Fail**: `approval_token_amount < current token balance` or Cooldown PDA doesn't exist

#### Method Signature

```javascript
async validateCooldown(params: {
  mint: PublicKey | string,              // Token address
  wallet: Keypair | PublicKey,           // User wallet
  tokenBalance?: BN | number | string    // Optional: user's current token balance
}): Promise<ValidationResult>
```

#### Parameter Description

- `mint`: Token address (required)
- `wallet`: User wallet, can be `Keypair` or `PublicKey` (required)
- `tokenBalance`: Optional parameter
  - If **not provided**: automatically queries user's current balance from chain
  - If **provided**: uses provided balance for validation (saves RPC call)

#### Return Value

```typescript
// When Cooldown PDA exists
{
  isValid: boolean,              // Whether validation passed
  exists: true,                  // Whether PDA exists
  reason: string,                // Status code: "VALID" | "AMOUNT_MISMATCH"
  message: string,               // Description message
  cooldownInfo: {
    approvalTokenAmount: BN,     // Approved amount recorded in PDA
    lastTradeTime: number,       // Last trade time (Unix timestamp)
    bump: number                 // PDA bump
  },
  tokenBalance: BN,              // User's actual token balance
  accounts: {
    mintAccount: PublicKey,
    userTokenAccount: PublicKey,
    cooldown: PublicKey,
    wallet: PublicKey
  }
}

// When Cooldown PDA doesn't exist
{
  isValid: false,
  exists: false,
  reason: "COOLDOWN_NOT_EXISTS",
  message: "Cooldown PDA does not exist. User has never traded this token or needs to call approveTrade first.",
  cooldownInfo: null,
  tokenBalance: null,
  accounts: { ... }
}
```

#### Status Code Description

| reason | Description | isValid | exists |
|--------|-------------|---------|--------|
| `VALID` | Validation passed, approval_token_amount >= token_balance | `true` | `true` |
| `AMOUNT_MISMATCH` | Validation failed, approval_token_amount < token_balance | `false` | `true` |
| `COOLDOWN_NOT_EXISTS` | Cooldown PDA doesn't exist | `false` | `false` |

#### Usage Examples

##### Example 1: Auto-fetch balance

```javascript
// Don't provide tokenBalance, auto-query from chain
const result = await sdk.tools.validateCooldown({
  mint: '4EasVvA1S6ytNpP1TDLBCPWHNLgd9sFnjWn4Wqo7wk83',
  wallet: userKeypair
});

if (result.exists) {
  if (result.isValid) {
    console.log('✅ Validation passed, can trade');
    console.log('Approved amount:', result.cooldownInfo.approvalTokenAmount.toString());
    console.log('User balance:', result.tokenBalance.toString());
  } else {
    console.log('❌ Validation failed, need to call approveTrade');
    console.log('Reason:', result.message);
  }
} else {
  console.log('❌ Cooldown PDA doesn\'t exist');
  console.log('User needs to trade once or call approveTrade first');
}
```

##### Example 2: Manually provide balance

```javascript
const anchor = require('@coral-xyz/anchor');

// Manually provide tokenBalance (saves RPC call)
const result = await sdk.tools.validateCooldown({
  mint: '4EasVvA1S6ytNpP1TDLBCPWHNLgd9sFnjWn4Wqo7wk83',
  wallet: new PublicKey('2uchzhSa3u5Teb6ZLFUUa1f4PhNgSrKoC5ZPJcm7R3QY'),
  tokenBalance: new anchor.BN('168239085')
});

console.log('Validation result:', result.isValid ? 'Pass' : 'Fail');
console.log('Status code:', result.reason);
console.log('Description:', result.message);
```

##### Example 3: Pre-trade validation

```javascript
// Validate cooldown status before trading
async function safeTrade(mint, wallet) {
  // 1. Validate cooldown status
  const validation = await sdk.tools.validateCooldown({
    mint,
    wallet
  });

  // 2. If PDA doesn't exist or validation fails, call approveTrade first
  if (!validation.isValid) {
    console.log('Need to call approveTrade first:', validation.message);

    const approveResult = await sdk.tools.approveTrade({
      mint,
      wallet
    });

    const signature = await sdk.connection.sendTransaction(
      approveResult.transaction,
      [wallet]
    );

    await sdk.connection.confirmTransaction(signature);
    console.log('✅ approveTrade completed');
  }

  // 3. Now can safely trade
  const buyResult = await sdk.trading.buy({
    mintAccount: mint,
    buyTokenAmount: new anchor.BN('1000000'),
    maxSolAmount: new anchor.BN('2000000000'),
    payer: wallet.publicKey
  });

  // 4. Send transaction
  const signature = await sdk.connection.sendTransaction(
    buyResult.transaction,
    [wallet]
  );

  return signature;
}
```

##### Example 4: Batch validate multiple tokens

```javascript
const mints = [
  '4EasVvA1S6ytNpP1TDLBCPWHNLgd9sFnjWn4Wqo7wk83',
  'GesAj2dTn2wdNcxj4x8qsqS9aNRVPBPkE76aaqg7skxu'
];

for (const mint of mints) {
  const result = await sdk.tools.validateCooldown({
    mint,
    wallet: userWallet
  });

  console.log(`\nToken: ${mint}`);
  console.log(`Status: ${result.reason}`);
  console.log(`Validation: ${result.isValid ? '✅ Pass' : '❌ Fail'}`);

  if (result.exists && !result.isValid) {
    console.log('Need to update approval_token_amount');
  }
}
```

---

## TradeCooldown PDA Description

### PDA Structure

```rust
pub struct TradeCooldown {
    pub last_trade_time: u32,          // Last trade timestamp (Unix timestamp, seconds)
    pub approval_token_amount: u64,    // Approved token amount for trading
    pub bump: u8,                      // PDA bump
}
```

### PDA Seeds

```javascript
[
  Buffer.from('trade_cooldown'),
  mintPubkey.toBuffer(),
  walletPubkey.toBuffer()
]
```

### Protection Mechanism

TradeCooldown PDA is used to prevent the following attacks:

1. **High-frequency trading attack**: Limit trading frequency through `last_trade_time`
2. **Transfer bypass attack**: Record balance snapshot through `approval_token_amount`, preventing users from bypassing cooldown time through transfers

### Lifecycle

1. **Creation**: Automatically created on first buy transaction
2. **Update**:
   - Automatically updated after each buy/sell transaction
   - Manually updated via `approveTrade` call
3. **Closure**: Manually closed via `closeTradeCooldown` call to recover rent

---

## Complete Workflow Example

```javascript
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { Fun100xSdk, getDefaultOptions, FUN100X_PROGRAM_ID } = require('100x-sdk');
const anchor = require('@coral-xyz/anchor');

async function main() {
  // 1. Initialize SDK
  const options = getDefaultOptions('LOCALNET');
  const connection = new Connection(options.solanaEndpoint, 'confirmed');
  const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, options);

  const mint = '4EasVvA1S6ytNpP1TDLBCPWHNLgd9sFnjWn4Wqo7wk83';
  const wallet = Keypair.generate(); // Your wallet

  // 2. Validate Cooldown status
  console.log('Validating Cooldown status...');
  const validation = await sdk.tools.validateCooldown({
    mint,
    wallet
  });

  console.log('Validation result:', validation.reason);

  // 3. Take action based on validation result
  if (!validation.isValid) {
    if (!validation.exists) {
      console.log('Cooldown PDA doesn\'t exist, will be auto-created on first trade');
    } else {
      console.log('Need to call approveTrade');

      const approveResult = await sdk.tools.approveTrade({
        mint,
        wallet
      });

      const signature = await connection.sendTransaction(
        approveResult.transaction,
        [wallet]
      );

      console.log('approveTrade transaction signature:', signature);
    }
  }

  // 4. Perform buy transaction
  console.log('Starting buy transaction...');
  const buyResult = await sdk.trading.buy({
    mintAccount: mint,
    buyTokenAmount: new anchor.BN('1000000'),
    maxSolAmount: new anchor.BN('2000000000'),
    payer: wallet.publicKey
  });

  const buySignature = await connection.sendTransaction(
    buyResult.transaction,
    [wallet]
  );

  console.log('Buy transaction signature:', buySignature);

  // 5. Validate post-trade status
  const newValidation = await sdk.tools.validateCooldown({
    mint,
    wallet
  });

  console.log('Post-trade validation result:', newValidation.isValid ? '✅ Pass' : '❌ Fail');
  console.log('Approved amount:', newValidation.cooldownInfo?.approvalTokenAmount.toString());
  console.log('User balance:', newValidation.tokenBalance?.toString());
}

main().catch(console.error);
```

---

## Error Handling

```javascript
try {
  const result = await sdk.tools.validateCooldown({
    mint: 'invalid-mint-address',
    wallet: userWallet
  });
} catch (error) {
  if (error.message.includes('Invalid public key')) {
    console.error('Invalid token address');
  } else if (error.message.includes('Cannot fetch token balance')) {
    console.error('Cannot fetch token balance, user may not have token account');
  } else if (error.message.includes('Cannot decode cooldown account')) {
    console.error('Cannot decode Cooldown account data');
  } else {
    console.error('Unknown error:', error);
  }
}
```

---

## Best Practices

### 1. Pre-trade Validation

Before buy/sell transactions, it's recommended to validate Cooldown status first:

```javascript
const validation = await sdk.tools.validateCooldown({ mint, wallet });
if (!validation.isValid) {
  // Handle failed validation
}
```

### 2. Manually Provide Balance

If you already have token balance from elsewhere, manually provide it to save RPC calls:

```javascript
const tokenBalance = await getTokenBalanceFromCache(mint, wallet);
const result = await sdk.tools.validateCooldown({
  mint,
  wallet,
  tokenBalance
});
```

### 3. Regular PDA Cleanup

For tokens no longer in use, regularly call `closeTradeCooldown` to recover rent:

```javascript
// Clean up all unused cooldown PDAs
for (const mint of unusedMints) {
  try {
    const result = await sdk.tools.closeTradeCooldown({ mint, wallet });
    const signature = await connection.sendTransaction(
      result.transaction,
      [wallet]
    );
    console.log(`Closed Cooldown PDA for ${mint}`);
  } catch (error) {
    console.log(`Skipped ${mint}:`, error.message);
  }
}
```

### 4. Batch Validation

For scenarios requiring validation of multiple tokens, execute in parallel for efficiency:

```javascript
const mints = ['mint1', 'mint2', 'mint3'];
const results = await Promise.all(
  mints.map(mint => sdk.tools.validateCooldown({ mint, wallet }))
);

results.forEach((result, index) => {
  console.log(`${mints[index]}: ${result.reason}`);
});
```

---

## Related Links

- [TradingModule Trading Module](./03-trading-module.md)
- [Constants and Helper Functions](./10-constants-and-helpers.md)
- [Quick Start Guide](./01-quick-start.md)

---

**Last Updated**: 2025-12-05
