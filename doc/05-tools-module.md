# ToolsModule

Access as `sdk.tools`. Cooldown PDAs are derived from `"trade_cooldown"`, mint bytes, and wallet public key bytes, under `sdk.programId`.
Examples with `await` assume an async function and a configured `sdk`, `connection`, `mint`, and funded `payer` Keypair.

## Transaction builders

```js
const approval = await sdk.tools.approveTrade({ mint, wallet: payer });
const close = await sdk.tools.closeTradeCooldown({ mint, wallet: payer });
```

Both methods accept a mint address (`string` or `PublicKey`) and `wallet` with a `.publicKey`. They return `{ transaction, signers: [], accounts }`. `approveTrade` builds an instruction that approves the wallet's current token balance for trading. `closeTradeCooldown` builds an instruction to close the wallet's cooldown PDA and reclaim its rent; it first reads and decodes that account and throws if it does not exist. These methods do not sign or submit the transaction.

```js
approval.transaction.feePayer = payer.publicKey;
approval.transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
const signature = await connection.sendTransaction(approval.transaction, [payer]);
```

Closing a cooldown PDA does not itself approve a balance. If the wallet later needs approval, call `approveTrade` again. The PDA belongs to the wallet used in the seeds, so another wallet cannot close it through this builder.

## `validateCooldown({ mint, wallet, tokenBalance? })`

This read method accepts `wallet` as a `PublicKey` or an object with `.publicKey`. If `tokenBalance` is omitted, the SDK fetches the associated token account balance from RPC. If supplied, it converts that value to `anchor.BN` and does not fetch the token balance.

```js
const status = await sdk.tools.validateCooldown({ mint, wallet: payer.publicKey });
if (!status.isValid) console.log(status.reason, status.message);
```

The result has `isValid`, `exists`, `reason`, `message`, `cooldownInfo`, `tokenBalance`, and `accounts`. If the PDA is missing, it returns `isValid: false`, `exists: false`, and `reason: 'COOLDOWN_NOT_EXISTS'`. If present, it compares `approvalTokenAmount >= tokenBalance` and returns `reason: 'VALID'` or `'AMOUNT_MISMATCH'`. The comparison does not establish that a trade will succeed: balance, price, liquidity, and transaction state can change before submission.

When a PDA exists but the associated token account does not, omitting `tokenBalance` causes an error. Pass a known balance only when that value is current and trusted.
