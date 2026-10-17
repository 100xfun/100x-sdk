# Quick start

Code snippets using `await` below belong inside an async function. Supply valid `mint`, `userAddress`, and a funded `payer` Keypair for the network you choose.

## Install and initialize

```bash
npm install 100x-sdk @solana/web3.js @coral-xyz/anchor
```

```js
const { Fun100xSdk, getDefaultOptions, getProgramId, CurveAMM } = require('100x-sdk');
const { Connection } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');

const options = getDefaultOptions('MAINNET'); // MAINNET, DEVNET, LOCALNET
const connection = new Connection(options.solanaEndpoint, 'confirmed');
const sdk = new Fun100xSdk(connection, getProgramId(options.network), options);
```

The default preset is `LOCALNET`. All three presets select `fast` as the data source. If you provide options without `defaultDataSource`, the SDK selects `chain`. `FUN100X_PROGRAM_ID` is mainnet only; `getProgramId(options.network)` also handles the `DEVNET` preset, whose `network` field is `localnet`.

For custom configuration, provide a valid `programId`, `network` (`mainnet` or `localnet`), RPC `Connection`, and any addresses required by the operations you use. `fastApiUrl` is required for `fast` queries. Token creation requires `paramsAccount`; `createAndBuy` additionally requires `feeRecipient` and `baseFeeRecipient`.

## Query data

```js
const rawPrice = await sdk.data.price(mint); // string in units of 10^23
const decimalPrice = CurveAMM.u128ToDecimal(rawPrice);

const longOrders = await sdk.data.orders(mint, { type: 'down_orders' });
const shortOrders = await sdk.data.orders(mint, { type: 'up_orders' });
const userOrders = await sdk.data.user_orders(userAddress, mint, {
  order_by: 'start_time_desc'
});
console.log(decimalPrice.toString(), longOrders.data.orders, shortOrders.data.orders);
```

`fast` orders support `page` and `limit`. `chain` orders always return all matching orders, and `chain.user_orders` requires a mint. `fast.user_orders` also accepts `mint = null` to query all mints, and supports `direction: 'dn' | 'up'`. `order_by` sorts user orders locally.

Override the source for one call with `{ dataSource: 'chain' }` or `{ dataSource: 'fast' }` on `sdk.data` methods. The `price()` method returns a raw price string on either source.

## Simulate and build a buy

```js
// Protocol token amounts use 9 decimals; SOL uses lamports (9 decimals).
const tokenAmount = '1000000000';
const simulation = await sdk.simulator.simulateTokenBuy(mint, tokenAmount);
console.log(simulation.completion, simulation.slippage, simulation.suggestedSolAmount);

// payer is an already funded @solana/web3.js Keypair.
const built = await sdk.trading.buy({
  mintAccount: mint,
  buyTokenAmount: new anchor.BN(tokenAmount),
  maxSolAmount: new anchor.BN('2000000000'),
  payer: payer.publicKey
});
built.transaction.feePayer = payer.publicKey;
built.transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
const signature = await connection.sendTransaction(built.transaction, [payer, ...built.signers]);
console.log(signature);
```

Simulation is an estimate; choose `maxSolAmount` based on your own limit and current liquidity. The SDK builds unsigned transactions. A browser wallet adapter should sign and send with its own API, including any `built.signers` required by the operation.

## Precision and configuration

| Value | Scale or meaning |
| --- | --- |
| SOL | 10^9 lamports per SOL |
| Protocol token | 10^9 smallest units per token; inspect on chain mint decimals when displaying arbitrary mints |
| Price | raw u128 integer scaled by 10^23 |
| `sdk.MAX_ORDERS_COUNT` | 50 |
| `sdk.FIND_MAX_ORDERS_COUNT` | 1000 |
| `sdk.SUGGEST_LIQ_RATIO` | 975 / 1000 = 97.5% |

See [Fun100xSdk](./02-sdk-overview.md) and [constants and helpers](./06-constants-and-helpers.md) for more detail.
