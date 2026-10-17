
const { MAX_CANDIDATE_INDICES } = require('./utils');

// Liquidity reservation ratio - how much liquidity to reserve relative to the last locked liquidity
const LIQUIDITY_RESERVATION = 100;  // 100%

// Calculate number of nodes to include before and after the main position
const CANDIDATE_NODES_EACH_SIDE = Math.floor((MAX_CANDIDATE_INDICES - 1) / 2);

/**
 * Transform orders data format
 * @param {Object} ordersData - Raw orders data
 * @returns {Array} Transformed orders array
 */
function transformOrdersData(ordersData) {
  if (!ordersData || !ordersData.success || !ordersData.data || !ordersData.data.orders) {
    throw new Error('Invalid orders data format');
  }

  return ordersData.data.orders.map(order => ({
    order_type: order.order_type,
    lock_lp_start_price: BigInt(order.lock_lp_start_price),
    lock_lp_end_price: BigInt(order.lock_lp_end_price),
    lock_lp_sol_amount: order.lock_lp_sol_amount,
    lock_lp_token_amount: order.lock_lp_token_amount,
    index: order.index,           // Preserve the index in the OrderBook
    order_id: order.order_id       // Preserve the order ID
  }));
}

/**
 * @typedef {Object} Order
 * @property {number} order_type - Order type (e.g., 1 for down_orders, 2 for up_orders).
 * @property {bigint} lock_lp_start_price - Locked liquidity start price.
 * @property {bigint} lock_lp_end_price - Locked liquidity end price.
 * @property {number} lock_lp_sol_amount - Locked SOL amount.
 * @property {number} lock_lp_token_amount - Locked token amount.
 */

/**
 * @typedef {Object} OverlapResult
 * @property {boolean} no_overlap - Whether there is no overlap. `true` means no overlap (safe to insert), `false` means there is an overlap.
 * @property {number[]} close_insert_indices - Array of position indices for inserting into the order book when closing. Contains the main position index and the indices of the 3 nodes before and after it.
 * @property {string} overlap_reason - Description of the overlap reason. Empty string when there is no overlap, otherwise describes the specific reason.
 */

/**
 * Checks whether the given price range overlaps with any range in the sorted order list, and returns a suitable insertion position index.
 *
 * ## Description
 * This function is used in margin trading (long/short) scenarios, where the position to insert the closing order into the order book (OrderBook) needs to be determined when opening a position.
 * The function checks whether the new order's price range overlaps with existing orders, and returns multiple candidate insertion position indices to improve the contract execution success rate.
 *
 * ## Core Logic
 * 1. **Price range check**: Use a binary search algorithm to find a suitable insertion position in the sorted order list
 * 2. **Overlap detection**:
 *    - Basic overlap: the new range directly overlaps with the price range of an existing order
 *    - Liquidity reservation overlap: considering the liquidity reservation area (default 100%), to prevent price ranges from being too close
 * 3. **Candidate index generation**:
 *    - Main insertion position: the logically most suitable insertion position index
 *    - Alternative positions: the indices of several nodes before and after that position (the count is determined by the MAX_CANDIDATE_INDICES constant)
 *    - Purpose: even if the order at the main position is deleted or moved, the contract can still find another suitable position
 *
 * ## Return Value Description
 * - **When no overlap**: returns the `close_insert_indices` array, containing the OrderBook indices of candidate insertion positions
 *   - Priority: main position → 1 before → 1 after → 2 before → 2 after → ... → N before → N after
 *   - The number of indices is determined by the MAX_CANDIDATE_INDICES constant (default 21, i.e. main position + 10 before + 10 after)
 * - **When there is overlap**: returns an empty array `[]`, indicating insertion is not possible
 * - **Empty order book**: returns `[65535]` (u16::MAX), indicating insertion at the head
 *
 * ## Order Type Rules
 * - **down_orders (long orders)**: prices sorted from high to low
 *   - lock_lp_start_price > lock_lp_end_price (price falling)
 *   - the new order's end_price must be >= the next order's start_price
 * - **up_orders (short orders)**: prices sorted from low to high
 *   - lock_lp_start_price < lock_lp_end_price (price rising)
 *   - the new order's end_price must be <= the next order's start_price
 *
 * @param {'down_orders' | 'up_orders'} order_type - Order type
 *   - 'down_orders': long orders, prices sorted from high to low
 *   - 'up_orders': short orders, prices sorted from low to high
 *
 * @param {Order[]} order_list - Sorted array of order objects
 *   - Each order must contain the following fields:
 *     - `index` {number}: the original index value of the order in the OrderBook (this is the key field required by the contract)
 *     - `lock_lp_start_price` {bigint|string}: the start price of the locked liquidity pool range
 *     - `lock_lp_end_price` {bigint|string}: the end price of the locked liquidity pool range
 *   - The array must already be sorted by price (down_orders from high to low, up_orders from low to high)
 *   - Usually comes from the data returned by `sdk.chain.orders()` or `sdk.fast.orders()`
 *
 * @param {bigint | number | string} lp_start_price - The start price of the new order
 *   - For down_orders: this is the higher price (near the opening price)
 *   - For up_orders: this is the lower price (near the stop loss price)
 *
 * @param {bigint | number | string} lp_end_price - The end price of the new order
 *   - For down_orders: this is the lower price (near the stop loss price)
 *   - For up_orders: this is the higher price (near the opening price)
 *
 * @returns {OverlapResult} Returns an object containing the overlap check result and candidate insertion indices
 * @returns {boolean} returns.no_overlap - Whether there is no overlap
 *   - `true`: safe to insert, use the indices in `close_insert_indices`
 *   - `false`: there is an overlap, cannot insert
 * @returns {number[]} returns.close_insert_indices - Array of OrderBook indices for candidate insertion positions
 *   - When no overlap: contains the main position and the indices of the 3 nodes before and after (up to 7)
 *   - When there is overlap: empty array `[]`
 *   - When order book is empty: `[65535]` indicates insertion at the head
 * @returns {string} returns.overlap_reason - Description of the overlap reason
 *   - When no overlap: empty string `""`
 *   - When there is overlap: describes the specific reason (e.g. "Overlaps with existing order range")
 *
 * @example
 * // Example 1: down_orders (long orders) - insert into the middle position
 * const downOrders = [
 *   { index: 10, lock_lp_start_price: 100n, lock_lp_end_price: 90n },  // Order 1
 *   { index: 25, lock_lp_start_price: 80n, lock_lp_end_price: 70n },   // Order 2
 *   { index: 33, lock_lp_start_price: 60n, lock_lp_end_price: 50n }    // Order 3
 * ];
 *
 * // Check whether the new order [75, 72] can be inserted
 * const result = checkPriceRangeOverlap('down_orders', downOrders, 75n, 72n);
 * console.log(result);
 * // Returns: {
 * //   no_overlap: true,
 * //   close_insert_indices: [25, 10, 33],
 * //   // The main position is 25 (Order 2), because the new order should be inserted between Order 2 and Order 3
 * //   // Alternative positions: 10 (Order 1 before), 33 (Order 3 after)
 * //   overlap_reason: ""
 * // }
 *
 * @example
 * // Example 2: down_orders - price overlap case
 * const downOrders = [
 *   { index: 10, lock_lp_start_price: 100n, lock_lp_end_price: 90n },
 *   { index: 25, lock_lp_start_price: 80n, lock_lp_end_price: 70n }
 * ];
 *
 * // New order [95, 85] overlaps with Order 1 [100, 90]
 * const result = checkPriceRangeOverlap('down_orders', downOrders, 95n, 85n);
 * console.log(result);
 * // Returns: {
 * //   no_overlap: false,
 * //   close_insert_indices: [],
 * //   overlap_reason: "Overlaps with existing order range"
 * // }
 *
 * @example
 * // Example 3: up_orders (short orders) - insert at the end
 * const upOrders = [
 *   { index: 5, lock_lp_start_price: 70n, lock_lp_end_price: 80n },
 *   { index: 12, lock_lp_start_price: 90n, lock_lp_end_price: 100n }
 * ];
 *
 * // New order [110, 120] should be inserted at the end
 * const result = checkPriceRangeOverlap('up_orders', upOrders, 110n, 120n);
 * console.log(result);
 * // Returns: {
 * //   no_overlap: true,
 * //   close_insert_indices: [12, 5],
 * //   // The main position is 12 (Order 2), because the new order should be inserted after Order 2
 * //   // Alternative positions: 5 (Order 1 before)
 * //   overlap_reason: ""
 * // }
 *
 * @example
 * // Example 4: empty order book - the first order
 * const emptyOrders = [];
 * const result = checkPriceRangeOverlap('down_orders', emptyOrders, 100n, 90n);
 * console.log(result);
 * // Returns: {
 * //   no_overlap: true,
 * //   close_insert_indices: [65535],
 * //   // 65535 is u16::MAX, indicating insertion at the head (special value when the order book is empty)
 * //   overlap_reason: ""
 * // }
 *
 * @example
 * // Example 5: actual usage scenario - long trade
 * async function openLongPosition(sdk, mint, buyTokenAmount, stopLossPrice) {
 *   // 1. Get down_orders data
 *   const ordersData = await sdk.data.orders(mint, { type: 'down_orders' });
 *   const orders = ordersData.data.orders;
 *
 *   // 2. Get the current price
 *   const currentPrice = BigInt(await sdk.data.price(mint));
 *
 *   // 3. Calculate the closing price range (simulation)
 *   const simulateResult = await sdk.simulator.simulateLongStopLoss(
 *     mint,
 *     buyTokenAmount,
 *     stopLossPrice
 *   );
 *
 *   // 4. Check whether the price range can be inserted
 *   const overlapCheck = checkPriceRangeOverlap(
 *     'down_orders',
 *     orders,
 *     simulateResult.close_lp_start_price,
 *     simulateResult.close_lp_end_price
 *   );
 *
 *   if (!overlapCheck.no_overlap) {
 *     throw new Error(`Unable to open position: ${overlapCheck.overlap_reason}`);
 *   }
 *
 *   // 5. Use close_insert_indices to call the contract
 *   const tx = await sdk.trading.long({
 *     mint,
 *     buyTokenAmount,
 *     maxSolAmount,
 *     marginSolMax,
 *     closePrice: stopLossPrice,
 *     closeInsertIndices: overlapCheck.close_insert_indices  // Passed to the contract
 *   });
 *
 *   return tx;
 * }
 *
 * @throws {Error} Throws an error when the input start and end prices do not match the order type rules
 *
 * @see {@link https://github.com/your-repo/docs/orderbook.md|OrderBook documentation}
 * @see {@link transformOrdersData} Data format transformation function
 *
 * @since 2.0.0
 * @version 2.0.0 - Changed from returning prev_order_pda/next_order_pda to returning close_insert_indices
 */
function checkPriceRangeOverlap(order_type, order_list, lp_start_price, lp_end_price) {
  // console.log("checkPriceRangeOverlap=",order_type,lp_start_price, lp_end_price)

  const startPrice = BigInt(lp_start_price);
  const endPrice = BigInt(lp_end_price);

  // If order list is empty, return u16::MAX to indicate insertion at head
  if (order_list.length === 0) {
    return { no_overlap: true, close_insert_indices: [65535], overlap_reason: "" };
  }

  const isDown = order_type === 'down_orders';

  // Validate and normalize the input price range, ensuring minPrice <= maxPrice
  if ((isDown && startPrice < endPrice) || (!isDown && startPrice > endPrice)) {
    throw new Error('输入的起始和结束价格与订单类型规则不匹配。');
  }
  const minPrice = isDown ? endPrice : startPrice;
  const maxPrice = isDown ? startPrice : endPrice;

  let low = 0;
  let high = order_list.length - 1;
  let insertionIndex = order_list.length; // Default to inserting at the end

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const order = order_list[mid];
    const orderStart = BigInt(order.lock_lp_start_price);
    const orderEnd = BigInt(order.lock_lp_end_price);

    const orderMin = isDown ? orderEnd : orderStart;
    const orderMax = isDown ? orderStart : orderEnd;

    // Core overlap check: (StartA < EndB) and (EndA > StartB)
    if (minPrice < orderMax && maxPrice > orderMin) {
      // Basic overlap occurred
      return {
        no_overlap: false,
        close_insert_indices: [],
        overlap_reason: "Overlaps with existing order range"
      };
    }

    if (isDown) {
      // down_orders: prices from high to low (orderMax decreasing)
      if (maxPrice > orderMax) { // The new range is to the "left" of the current range (higher price)
        insertionIndex = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    } else {
      // up_orders: prices from low to high (orderMin increasing)
      if (minPrice < orderMin) { // The new range is to the "left" of the current range (lower price)
        insertionIndex = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
  }

  // Based on the found insertion point, determine the logical previous and next orders
  // insertionIndex is the position where the new range should be inserted so the list remains sorted
  const nextOrder = order_list[insertionIndex] || null;
  const prevOrder = order_list[insertionIndex - 1] || null;

  // Check liquidity reservation overlap
  function checkLiquidityReservationOverlap(checkOrder) {
    if (!checkOrder) return false;

    const orderStart = BigInt(checkOrder.lock_lp_start_price);
    const orderEnd = BigInt(checkOrder.lock_lp_end_price);
    const orderMin = isDown ? orderEnd : orderStart;
    const orderMax = isDown ? orderStart : orderEnd;

    // Calculate the expanded range value
    const expansionAmount = (orderMax - orderMin) * BigInt(Math.floor(LIQUIDITY_RESERVATION)) / 100n;

    let hasOverlap;
    if (isDown) {
      // down_orders: start unchanged, end expands downward
      const expandedEnd = orderMin - expansionAmount;
      hasOverlap = startPrice >= expandedEnd;
    } else {
      // up_orders: start unchanged, end expands upward
      const expandedEnd = orderMax + expansionAmount;
      hasOverlap = startPrice <= expandedEnd;
    }

    return hasOverlap;
  }

  // Check liquidity reservation overlap with the previous order
  if (prevOrder && checkLiquidityReservationOverlap(prevOrder)) {
    return {
      no_overlap: false,
      close_insert_indices: [],
      overlap_reason: "Overlaps with previous order's liquidity reservation range"
    };
  }

  // No overlap, build the close_insert_indices array
  // Priority: main position → 1 before → 1 after → 2 before → 2 after → 3 before → 3 after
  const indices = [];

  // Main insertion position logic:
  // - down_orders (prices high to low): insert after prevOrder
  //   - If there is no prevOrder (insertionIndex=0), the price is the highest, use u16::MAX to insert at the head
  //   - If there is a prevOrder, use prevOrder.index, insert after it
  // - up_orders (prices low to high): insert after prevOrder
  //   - If there is no prevOrder (insertionIndex=0), the price is the lowest, use u16::MAX to insert at the head
  //   - If there is a prevOrder, use prevOrder.index, insert after it

  if (prevOrder && prevOrder.index !== undefined) {
    // There is a previous order, insert after it
    indices.push(prevOrder.index);
  } else {
    // No previous order (insertionIndex=0)
    // down_orders: highest price, insert at the head (65535)
    // up_orders: lowest price, insert at the head (65535)
    indices.push(65535); // u16::MAX - insert at the head
  }

  // Add the indices of the nodes before and after
  // Calculate how many before/after nodes to add based on the MAX_CANDIDATE_INDICES constant
  for (let offset = 1; offset <= CANDIDATE_NODES_EACH_SIDE; offset++) {
    // Add the offset-th node before
    const beforeIndex = insertionIndex - 1 - offset;
    if (beforeIndex >= 0 && order_list[beforeIndex] && order_list[beforeIndex].index !== undefined) {
      indices.push(order_list[beforeIndex].index);
    }

    // Add the offset-th node after
    // offset=1 should be nextOrder (insertionIndex), offset=2 is insertionIndex+1, and so on
    const afterIndex = insertionIndex + offset - 1;
    if (afterIndex < order_list.length && order_list[afterIndex] && order_list[afterIndex].index !== undefined) {
      indices.push(order_list[afterIndex].index);
    }
  }

  return {
    no_overlap: true,
    close_insert_indices: indices,
    overlap_reason: ""
  };
}


module.exports = {
  transformOrdersData,
  checkPriceRangeOverlap
};