# 100x SDK documentation

These guides describe the current JavaScript implementation in `src/` (package version **1.0.8**).

| Guide | Contents |
| --- | --- |
| [Quick start](./01-quick-start.md) | Installation, network setup, data queries, signing |
| [Fun100xSdk](./02-sdk-overview.md) | Constructor, modules, data routing |
| [Token module](./03-token-module.md) | `create`, `createAndBuy` |
| [Parameter module](./04-parameter-module.md) | Partner parameter accounts and PDAs |
| [Tools module](./05-tools-module.md) | Trade approval and cooldown accounts |
| [Constants and helpers](./06-constants-and-helpers.md) | Presets, program IDs, precision, `CurveAMM` |
| [Position tab data](./07-position-data-guide.md) | Order data fields and UI calculation boundaries |

The source also implements `TradingModule`, `FastModule`, `ChainModule`, and `SimulatorModule`. Their public method names and signatures are in the [root README](../README.md) and source files: [`trading.js`](../src/modules/trading.js), [`fast.js`](../src/modules/fast.js), [`chain.js`](../src/modules/chain.js), and [`simulator.js`](../src/modules/simulator.js). These modules do not currently have separate guides.

## Minimal setup

```js
const { Fun100xSdk, getDefaultOptions, getProgramId } = require('100x-sdk');
const { Connection } = require('@solana/web3.js');

const options = getDefaultOptions('MAINNET');
const connection = new Connection(options.solanaEndpoint, 'confirmed');
const sdk = new Fun100xSdk(connection, getProgramId(options.network), options);

async function main(mint) {
  const price = await sdk.data.price(mint); // raw u128 string
  const orders = await sdk.data.orders(mint, { type: 'down_orders' });
  return { price, orders };
}
```

`getDefaultOptions()` uses `LOCALNET` when called without a name. The presets choose the `fast` API; omitting `defaultDataSource` from the constructor options chooses `chain`. The `DEVNET` preset intentionally carries `network: 'localnet'` and uses the localnet IDL/program ID.

## Common return shapes

- `sdk.data.price(mint)` returns a raw u128 price string. Convert it with `CurveAMM.u128ToDecimal()`.
- `sdk.data.orders(mint, options)` and `sdk.data.user_orders(user, mint, options)` return `{ success, data: { orders, total, ... }, message }`.
- Transaction builders return `{ transaction, signers, accounts }`. Sign and submit the transaction yourself.
- Simulation return shapes differ by method. `simulateTokenBuy` / `simulateTokenSell` return `liqResult`, `completion`, `slippage`, and suggested amount strings. `simulateBuy` / `simulateSell` return `{ success, errorCode, errorMessage, data }`.

For TypeScript declarations, see [`src/types/index.d.ts`](../src/types/index.d.ts). Some declarations do not yet cover every JavaScript method or parameter; consult the implementation for those cases.

## Trading and simulation reference

All six trading methods return an unsigned transaction builder result. Amount arguments to trading methods are `anchor.BN`; `payer` is a `PublicKey`. `mintAccount` can be a base58 string or `PublicKey`.

| Method | Additional required fields |
| --- | --- |
| `trading.buy` | `buyTokenAmount`, `maxSolAmount` |
| `trading.sell` | `sellTokenAmount`, `minSolOutput` |
| `trading.long` | `buyTokenAmount`, `maxSolAmount`, `marginSol`, `closePrice`, `closeInsertIndices` (1–20 indices) |
| `trading.short` | `borrowSellTokenAmount`, `minSolOutput`, `marginSol`, `closePrice`, `closeInsertIndices` (1–20 indices) |
| `trading.closeLong` | `sellTokenAmount`, `minSolOutput`, `closeOrderId`, `closeOrderIndices` (1–19 indices), `userSolAccount` |
| `trading.closeShort` | `buyTokenAmount`, `maxSolAmount`, `closeOrderId`, `closeOrderIndices` (1–19 indices), `userSolAccount` |

Each method also accepts `{ computeUnits }` as its second argument. `closeOrderId` is the order's stable `order_id`, while the candidate arrays contain orderbook slot indices. Use `simulator.simulateLongClose(mint, orderId)` or `simulateShortClose(mint, orderId)` to obtain `{ closeOrderIndices }`. The stop loss methods are `simulateLongStopLoss`, `simulateShortStopLoss`, `simulateLongSolStopLoss`, and `simulateShortSolStopLoss`; they return an executable stop loss price, estimated margin, leverage display, and `close_insert_indices` among other fields. `simulateBuy` accepts lamports and `simulateSell` accepts token smallest units; both return a `{ success, errorCode, errorMessage, data }` result rather than throwing for their handled calculation errors.

## Token quote compatibility (1.0.8)

`simulateTokenBuy(mint, amount, passOrder?, lastPrice?, ordersData?, curveData?)` and `simulateTokenSell(...)` keep the same argument order and result fields. `passOrder` accepts a stable `order_id` as a string, bigint, or safe integer (including zero). Legacy PDA strings still match `order_pda` when supplied in the order data. `null` and omitted values skip no order. Use strings or bigints for amounts and IDs beyond JavaScript's safe integer range; rounded numeric inputs are rejected.

Quotes use the supplied pool's virtual reserves throughout. Sell quotes no longer use the legacy global `MIN_U128_PRICE` as a trading floor. After traversing the complete order chain, they calculate only the remaining requested tokens, capped by `next_lp_token_amount` when present. The public constant remains unchanged for existing callers. The order traversal limit still prevents a truncated orderbook from being treated as its end.

For sell results, `free_lp_*_amount_sum` includes traversed free ranges plus the portion of the final range needed by this request; for an empty orderbook it describes the requested trade. These fields are quote coverage, not a maximum withdrawal or the pool's spendable SOL balance. `has_infinite_lp` marks reaching the order chain's end, not unlimited cash. `pass_order_id` remains the skipped order's array index, not its stable ID or on-chain slot. Partial quotes keep `real_lp_sol_amount = 0` and provide a smaller suggested amount through the existing fields.

Quote SOL amounts remain before swap fees. Existing fee helpers, stop loss helpers, transaction builders, signing and submission behavior are unchanged. Quotes do not validate actual pool balances or guarantee execution; retain transaction simulation and existing minimum-output/maximum-input checks.
