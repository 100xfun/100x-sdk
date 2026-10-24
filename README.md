# 100x SDK

JavaScript SDK for the 100x protocol on Solana. The package provides transaction builders for trading and token creation, RPC and API data readers, and simulation utilities. Package version: **1.0.8**.

## Install

```bash
npm install 100x-sdk @solana/web3.js @coral-xyz/anchor
```

## Quick start

```js
const { Fun100xSdk, getDefaultOptions, getProgramId } = require('100x-sdk');
const { Connection } = require('@solana/web3.js');

const options = getDefaultOptions('MAINNET'); // MAINNET, DEVNET, LOCALNET
const connection = new Connection(options.solanaEndpoint, 'confirmed');
const sdk = new Fun100xSdk(connection, getProgramId(options.network), options);

async function main() {
  const mintAddress = process.env.MINT_ADDRESS; // set to a valid 100x token mint
  if (!mintAddress) throw new Error('Set MINT_ADDRESS');
  const price = await sdk.data.price(mintAddress); // raw u128 price as a string
  const longOrders = await sdk.data.orders(mintAddress, { type: 'down_orders' });
  console.log(price, longOrders.data.orders);
}
main().catch(console.error);
```

`getDefaultOptions()` defaults to `LOCALNET`. Each preset sets `defaultDataSource: 'fast'`; constructing the SDK without that option defaults to `chain`. `FUN100X_PROGRAM_ID` is the mainnet program ID. Use `getProgramId(options.network)` for network specific initialization; the `DEVNET` preset uses the `localnet` program and IDL.

## Modules

| Property | Current methods |
| --- | --- |
| `sdk.trading` | `buy`, `sell`, `long`, `short`, `closeLong`, `closeShort` |
| `sdk.fast` | `mints`, `mint_info`, `orders`, `price`, `user_orders` |
| `sdk.chain` | `getCurveAccount`, `getCurveAccountAddress`, `invalidateCurveCache`, `orders`, `price`, `user_orders`, `debug_orders` |
| `sdk.data` | `orders`, `price`, `user_orders`; routes to `fast` or `chain` |
| `sdk.token` | `create`, `createAndBuy` |
| `sdk.param` | `createParams`, `getParams`, `getAdmin`, `getParamsAddress`, `getAdminAddress` |
| `sdk.simulator` | `simulateTokenBuy`, `simulateTokenSell`, stop loss and close index helpers, `simulateBuy`, `simulateSell` |
| `sdk.tools` | `approveTrade`, `closeTradeCooldown`, `validateCooldown` |
| `sdk.curve` | `CurveAMM` class |

`CurveAMM`, `OrderUtils`, `getDefaultOptions`, `getProgramId`, `FUN100X_PROGRAM_ID`, and `Fun100xSdk` are package exports. `OrderUtils` currently has no implemented helper methods.

## Data and precision

- `sdk.data` uses `options.defaultDataSource` and accepts a per call `{ dataSource: 'fast' | 'chain' }` override. `fast` requires `fastApiUrl`; `chain` reads from RPC. `fast` paginates orders; `chain` returns all orders and ignores `page` and `limit`.
- `price()` returns a raw u128 price **string**. Use `CurveAMM.u128ToDecimal(price)` for a decimal price. The price scale is **10^23**.
- SOL and protocol token amounts use **10^9** smallest units. Use strings, `bigint`, or `anchor.BN` according to the called method; trading transaction builders require `anchor.BN` amounts. Check `sdk.chain.getCurveAccount(mint).decimals` when displaying a mint's on chain token amount.
- Order amount fields are returned as strings to avoid losing integer precision. `orders()` uses string `order_type` (`down_orders` = long, `up_orders` = short); `user_orders()` uses numeric `order_type` (1 = long, 2 = short).

## Build and send a trade

This snippet assumes the `sdk` and `connection` above, a valid `mintAddress`, and a funded `payer` Keypair. Run it inside an async function.

```js
const anchor = require('@coral-xyz/anchor');
const result = await sdk.trading.buy({
  mintAccount: mintAddress,
  buyTokenAmount: new anchor.BN('1000000000'), // 1 token at 9 decimals
  maxSolAmount: new anchor.BN('2000000000'),   // at most 2 SOL
  payer: payer.publicKey
});

result.transaction.feePayer = payer.publicKey;
result.transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
const signature = await connection.sendTransaction(result.transaction, [payer, ...result.signers]);
console.log(signature);
```

Transaction builders return `{ transaction, signers, accounts }` and do not submit transactions. `sdk.token.create()` and `createAndBuy()` return the mint keypair in `signers`; include it when signing. Browser wallet adapters have their own signing and sending APIs.

## Documentation

See the [documentation index](./doc/README.md), [quick start](./doc/01-quick-start.md), [SDK class](./doc/02-sdk-overview.md), [token creation](./doc/03-token-module.md), [partner parameters](./doc/04-parameter-module.md), [trade tools](./doc/05-tools-module.md), [constants and precision](./doc/06-constants-and-helpers.md), and [position data guide](./doc/07-position-data-guide.md).

## Development

```bash
npm run build
npm test
npm run lint
```

`npm test` runs `test/precision.test.js`. The package targets Node.js 14+ and has browser bundles. The source of public TypeScript declarations is [`src/types/index.d.ts`](./src/types/index.d.ts); runtime behavior is defined by `src/`.

## License

The package declares the MIT license in `package.json`. This repository does not currently contain a separate license file.
