# TokenModule

Access as `sdk.token`. Both methods **build** a transaction and return `{ transaction, signers, accounts }`; they do not send it. The mint must be a `Keypair`, and `signers` contains that mint keypair. The payer must also sign before submission.
Examples with `await` assume an async function and a configured `sdk`, `connection`, and funded `payer` Keypair.

## `create(params)`

```js
const { Keypair } = require('@solana/web3.js');
const mint = Keypair.generate();
const built = await sdk.token.create({
  mint,
  name: 'Example Token',
  symbol: 'EXM',
  uri: 'https://example.com/metadata.json',
  payer: payer.publicKey
});
```

Required fields: `mint: Keypair`, `name: string`, `symbol: string`, `uri: string`, and `payer: PublicKey`. `sdk.paramsAccount` must be configured. The metadata JSON must already be hosted at `uri`; this module does not upload it.

The optional pool parameters are `customLpSol: anchor.BN` (lamports), `customLpToken: anchor.BN` (token smallest units), `customBorrowRatio: number`, `customBorrowDuration: number` (seconds), and `customFee: number`. Supply all five together for an advanced pool, or omit all five for a standard pool. `create()` forwards these values to the program; the SDK does not check combinations or ranges. Use the current program rules when choosing values.

The default pool's initial virtual reserves in `CurveAMM` are 30 SOL and 1.073 billion tokens. The created curve records its actual `initialVirtualSol` and `initialVirtualToken`; use those values for calculations on an advanced pool. The metadata URI should resolve to token metadata JSON. The SDK passes only the URI to the program.

`create()` adds a compute unit limit instruction of `400000`. The returned `accounts` include `mint`, `curveAccount`, `poolTokenAccount`, `poolBorrowTokenAccount`, `poolSolAccount`, `upOrderbook`, `downOrderbook`, `metadataAccount`, and `payer`.

## `createAndBuy(params, options = {})`

`createAndBuy` accepts the same creation fields and optional pool fields, plus `buyTokenAmount: anchor.BN` and `maxSolAmount: anchor.BN`. `options.computeUnits` defaults to `1800000`.

```js
const anchor = require('@coral-xyz/anchor');
const built = await sdk.token.createAndBuy({
  mint,
  name: 'Example Token',
  symbol: 'EXM',
  uri: 'https://example.com/metadata.json',
  payer: payer.publicKey,
  buyTokenAmount: new anchor.BN('1000000000'), // 1 token at 9 decimals
  maxSolAmount: new anchor.BN('2000000000')    // at most 2 SOL
});
```

This method builds one transaction with the create instruction, an associated token account creation instruction if needed, and the buy instruction. It requires `sdk.paramsAccount`, `sdk.feeRecipient`, and `sdk.baseFeeRecipient`. It returns the mint keypair in `signers`, and adds `userTokenAccount`, `cooldown`, `feeRecipientAccount`, and `baseFeeRecipientAccount` to `accounts`.

## Sign and submit with a Keypair

```js
built.transaction.feePayer = payer.publicKey;
built.transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
const signature = await connection.sendTransaction(built.transaction, [payer, ...built.signers]);
```

A browser wallet adapter uses its own signing API; ensure it signs together with the mint keypair. The `createAndBuy` transaction can be large, so verify its size and compute budget against your network before sending.

## PDA seeds

For mint `mint.publicKey`, the program PDAs use `borrowing_curve`, `pool_token`, `pool_borrow_token`, `pool_sol`, `up_orderbook`, and `down_orderbook` plus the mint bytes. The Metaplex metadata PDA uses the metadata program ID and mint. `createAndBuy` also derives `trade_cooldown` from the mint and payer public keys. These addresses are available in the returned `accounts` object.
