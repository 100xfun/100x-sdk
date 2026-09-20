
====Position Tab Data List - Key Data =====


Icon      Coin/SOL        Total P&L (USDT)
        MyCoin/SOL         35.1(+4.5%)

Open Time                Direction          Leverage
5s | 1m | 2day      Long|sell      x2 x5

Margin (USDT)   Realized Profit USDT
103.1                 0 | 55.1 $

Unrealized P&L USDT    Unrealized P&L %
60.5                 20.1%

Buttons (at least 2):  Close (quick close)   Partial (manual close, can close half position, etc.)

Note: The 2 most important data points:
 1. Total P&L is the most important, displayed large and bold, green for profit, red for loss
 2. Unrealized P&L is the key for users to check liquidation distance. If the loss reaches -100%, forced liquidation will be triggered.
 3. Add an Info icon that users can click to view the order details panel (consider using a popup modal)


========Order Details Panel Data===========
The details panel data is fetched directly from the blockchain, provide as much detail as possible to appear more professional
mint: token address
user: position opener
lock_lp_start_price: locked LP range start price
lock_lp_end_price: locked LP range end price
open_price: opening price, set when opening, never changes
order_id: unique order ID, globally incremental
lock_lp_sol_amount: locked LP range SOL amount
lock_lp_token_amount: locked LP range Token amount
next_lp_sol_amount: SOL amount in LP range to next node
next_lp_token_amount: Token amount in LP range to next node
margin_init_sol_amount: initial margin SOL amount
margin_sol_amount: margin SOL amount
borrow_amount: loan amount: if long, SOL is borrowed; if short, Token is borrowed
position_asset_amount: current position asset amount (SOL when short, Token when long)
realized_sol_amount: realized SOL profit
version: u32, order version number (increments with each update)
start_time: u32, order start timestamp (Unix timestamp, seconds)
end_time: loan expiration timestamp (Unix timestamp, seconds)
next_order: slot index pointing to the next order
prev_order: slot index pointing to the previous order
borrow_fee: transaction fee, e.g.: 50 = 0.5%, 100 = 1%
order_type: order type: 1=long (Down direction) 2=short (Up direction)

The panel doesn't need to be designed too well, just display the JSON data nicely, e.g.:
    {
      "borrow_amount": 9007199254740991,
      "borrow_fee": 1073741824,
      "end_time": 1073741824,
      "lock_lp_end_price": "string",
      "lock_lp_sol_amount": 9007199254740991,
      "lock_lp_start_price": "string",
      "lock_lp_token_amount": 9007199254740991,
      "margin_init_sol_amount": 9007199254740991,
      "margin_sol_amount": 9007199254740991,
      "next_lp_sol_amount": 9007199254740991,
      "next_lp_token_amount": 9007199254740991,
      "next_order": 1073741824,
      "open_price": "string",
      "order_id": 9007199254740991,
      "order_type": 1073741824,
      "position_asset_amount": 9007199254740991,
      "prev_order": 1073741824,
      "realized_sol_amount": 9007199254740991,
      "start_time": 1073741824,
      "user": "string",
      "version": 1073741824,
      "direction": "string",
      "index": 1073741824,
      "mint": "string"
    }



