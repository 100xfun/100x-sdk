# Fun100xSdk

## Constructor

```js
new Fun100xSdk(connection, programId, options = {})
```

`connection` is a Solana `Connection`. `programId` is a `PublicKey` or base58 string. The constructor does **not** accept a wallet; transactions are signed after the SDK builds them. `options.network` chooses the IDL: `'localnet'` uses `fun100x_localnet.json`, while every other value uses `fun100x_main.json`. Match the IDL, program ID, and RPC network.

```js
const { Fun100xSdk, getDefaultOptions, getProgramId } = require('100x-sdk');
const { Connection } = require('@solana/web3.js');
const options = getDefaultOptions('MAINNET');
const connection = new Connection(options.solanaEndpoint, 'confirmed');
const sdk = new Fun100xSdk(connection, getProgramId(options.network), options);
```

| Option | Use |
| --- | --- |
| `network` | IDL selection: `mainnet` or `localnet` |
| `defaultDataSource` | `'fast'` or `'chain'`; omitted means `'chain'` |
| `fastApiUrl` | Required when using `sdk.fast` or `sdk.data` with `fast` |
| `paramsAccount` | Required by token creation |
| `feeRecipient`, `baseFeeRecipient` | Required by `createAndBuy`; parsed as `PublicKey` |
| `commitment`, `preflightCommitment`, `skipPreflight`, `maxRetries` | Passed into the Anchor provider options |

`solanaEndpoint` is a preset field used to construct `Connection`; the SDK itself uses the supplied `connection`. The constructor also calls `anchor.setProvider`, changing Anchor's process wide provider.

## Properties and modules

The instance exposes `connection`, `programId`, `idl`, `program`, `options`, `defaultDataSource`, `fastApiUrl`, `feeRecipient`, `baseFeeRecipient`, and `paramsAccount`. Parsed account fields are `PublicKey` or `null`.

| Property | Purpose |
| --- | --- |
| `trading` | Build buy, sell, long, short, and close transactions |
| `token` | Build token creation transactions |
| `param` | Build/query partner parameter accounts |
| `fast` | Read API data |
| `chain` | Read RPC data and curve accounts |
| `simulator` | Calculate trade estimates and order indices |
| `tools` | Build cooldown related transactions and validate cooldowns |
| `curve` | Reference to the `CurveAMM` class |
| `data` | Route `orders`, `price`, and `user_orders` to `fast` or `chain` |

`Fun100xSdk.CurveAMM` and `Fun100xSdk.OrderUtils` are static references. `OrderUtils` has no implemented methods in this version.

The instance constants are `MAX_ORDERS_COUNT = 50`, `FIND_MAX_ORDERS_COUNT = 1000`, and `SUGGEST_LIQ_RATIO = 975` (per mille).

## Unified data API

```js
const price = await sdk.data.price(mint); // raw u128 string
const orders = await sdk.data.orders(mint, {
  type: 'down_orders', // long; up_orders = short
  dataSource: 'chain'
});
const userOrders = await sdk.data.user_orders(user, mint, {
  order_by: 'start_time_desc',
  dataSource: 'fast'
});
```

The constructor validates `defaultDataSource`. An invalid per call `dataSource` is not validated and routes to `fast`, so pass only `'fast'` or `'chain'`. `fast` order queries paginate; `chain` order queries return all orders. `chain.user_orders` requires a mint, while `fast.user_orders` can take `null` for all mints. `price()` returns a string; order queries return `{ success, data, message }`.

## Program IDs

`FUN100X_PROGRAM_ID` is the mainnet ID. `getProgramId('localnet')` returns the localnet ID; other values return mainnet. Presets from `getDefaultOptions('DEVNET')` use `network: 'localnet'`, so pass `getProgramId(options.network)` when using a preset.

See [quick start](./01-quick-start.md) and [constants](./06-constants-and-helpers.md).
