# Position tab data guide

This is an integration guide for displaying margin positions from the current SDK. The SDK returns raw order and curve data; it does not calculate USDT P&L, live leverage, liquidation distance, or partial close amounts for a position tab.

## Load active positions

```js
const response = await sdk.data.user_orders(userAddress, mintAddress, {
  order_by: 'start_time_desc'
});
const positions = response.data.orders;
```

`chain.user_orders` requires a mint and returns all matching orders; `fast.user_orders` accepts `null` as the mint to query all tokens and supports pagination. Each `user_orders` item uses numeric `order_type`: **1 = long**, **2 = short**. By contrast, `orders()` returns string `order_type`: `down_orders` or `up_orders`. Both readers keep large amount and price fields as strings to preserve precision.

| UI field | SDK data or calculation |
| --- | --- |
| Token / owner | `mint`, `user` |
| Direction | `order_type` (1 long, 2 short) |
| Open time | `start_time` Unix seconds |
| Order ID | `order_id` string; use for close helpers |
| Opening and LP prices | `open_price`, `lock_lp_start_price`, `lock_lp_end_price`; raw u128 scaled by 10^23 |
| Margin | `margin_init_sol_amount`, `margin_sol_amount`; lamports as strings |
| Borrowed amount | `borrow_amount`; SOL for long, token units for short |
| Position asset | `position_asset_amount`; token for long, SOL for short |
| Realized SOL | `realized_sol_amount`; lamports as a string |
| Expiration | `end_time` Unix seconds |
| Orderbook location | `index`, `next_order`, `prev_order`; `65535` means no adjacent order |
| Borrow fee | `borrow_fee`; denominator 100000, so 2000 represents 2% |

The order decoder also returns `lock_lp_sol_amount`, `lock_lp_token_amount`, `next_lp_sol_amount`, and `next_lp_token_amount`. An order's `index` is its current slot in an orderbook; `order_id` is the stable ID used for closing. Do not use the slot index as `closeOrderId`.

## Price and P&L display

Use `sdk.data.price(mint)` for the current raw price string and `CurveAMM.u128ToDecimal(rawPrice)` for display. Use `sdk.chain.getCurveAccount(mint).decimals` for token display. SOL values use 10^9 lamports per SOL. Convert raw strings to `bigint` or a decimal library before arithmetic; casting to `number` can lose precision.

USDT P&L requires an external SOL/USDT conversion rate, a defined valuation model, and handling of fees and realized versus unrealized amounts. The SDK does not expose a `getPositionPnl()` or liquidation distance method. Avoid presenting a fixed rule such as “unrealized P&L reaches -100% means liquidation” without deriving it from the current contract state.

## Close action

```js
const candidates = await sdk.simulator.simulateLongClose(mintAddress, order.order_id);
const built = await sdk.trading.closeLong({
  mintAccount: mintAddress,
  sellTokenAmount: tokenAmountBN,
  minSolOutput: minSolOutputBN,
  closeOrderId: order.order_id,
  closeOrderIndices: candidates.closeOrderIndices,
  payer: payer.publicKey,
  userSolAccount: order.user
});
```

For shorts, use `simulateShortClose()` and `trading.closeShort()` with `buyTokenAmount` and `maxSolAmount`. These methods build transactions; your application signs and sends them. The SDK has no standalone “close half” UI operation. Any partial close must use the corresponding close builder with an allowed amount and current order data.
