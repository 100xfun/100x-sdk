
const CurveAMM = require('../../utils/curve_amm');
const Decimal = require('decimal.js');


/**
 * Calculate liquidity impact for token buy operations
 *
 * This function analyzes the liquidity impact of buy operations within price ranges,
 * calculates available free liquidity, locked liquidity, and supports skipping specific
 * orders (treating their liquidity as available). Applicable for long orders (up_orders) scenarios.
 *
 * @param {bigint|string|number} price - Current token price, used as calculation start price
 * @param {bigint|string|number} buyTokenAmount - Amount of tokens to buy, target purchase amount
 * @param {Array<Object>} orders - Array of orders sorted by lock_lp_start_price (ascending):
 *   - order_type: {number} Order type (1=long, 2=short)
 *   - mint: {string} Token mint address
 *   - user: {string} User address
 *   - lock_lp_start_price: {string} LP lock start price (required)
 *   - lock_lp_end_price: {string} LP lock end price (required)
 *   - lock_lp_sol_amount: {number} Locked SOL amount (required)
 *   - lock_lp_token_amount: {number} Locked token amount (required)
 *   - start_time: {number} Start timestamp
 *   - end_time: {number} End timestamp
 *   - margin_sol_amount: {number} Margin SOL amount
 *   - borrow_amount: {number} Borrow amount
 *   - position_asset_amount: {number} Position asset amount
 *   - borrow_fee: {number} Borrow fee
 *   - order_pda: {string} Order PDA address (required for passOrder matching)
 * @param {number} onceMaxOrder - Maximum orders to process at once, limits traversal range
 * @param {string|null} passOrder - Order PDA address string to skip, when this value matches an order's order_pda, skip that order and count its liquidity as free liquidity
 *
 * @returns {Object} Liquidity calculation result object with detailed liquidity analysis data:
 *
 *   **Free Liquidity:**
 *   - free_lp_sol_amount_sum: {bigint} Total available free liquidity SOL amount, includes: 1) price gap liquidity 2) skipped order liquidity 3) infinite liquidity (if any)
 *   - free_lp_token_amount_sum: {bigint} Total available free liquidity token amount, corresponds to SOL, represents max tokens buyable without force closing any orders
 *
 *   **Locked Liquidity:**
 *   - lock_lp_sol_amount_sum: {bigint} Total locked liquidity SOL amount, excludes skipped orders, this liquidity is not directly usable
 *   - lock_lp_token_amount_sum: {bigint} Total locked liquidity token amount, excludes skipped orders, corresponds to locked SOL liquidity
 *
 *   **Liquidity Status Indicators:**
 *   - has_infinite_lp: {boolean} Whether includes infinite liquidity, true means order chain ended and liquidity to max price (MAX_U128_PRICE) was calculated
 *   - pass_order_id: {number} Index of skipped order in array, -1 means no order skipped, >=0 means order at that index was skipped
 *
 *   **Buy Execution Info:**
 *   - force_close_num: {number} Number of orders that need to be force closed, indicates how many orders need force closure to buy target amount, 0 means no force closure needed
 *   - ideal_lp_sol_amount: {bigint} Ideal SOL usage, theoretical minimum SOL requirement calculated directly from current price using CurveAMM, ignores liquidity distribution
 *   - real_lp_sol_amount: {bigint} Actual SOL usage, precise SOL requirement considering real liquidity distribution. 0 means current free liquidity insufficient for buy requirement, need to force close more orders
 *
 * @throws {Error} Parameter validation error: invalid price, buyTokenAmount, orders, or onceMaxOrder
 * @throws {Error} Price conversion error: cannot convert price parameters to BigInt
 * @throws {Error} Liquidity calculation error: CurveAMM calculation failure or value conversion error
 * @throws {Error} Gap liquidity calculation failure: price gap liquidity calculation exception
 * @throws {Error} Infinite liquidity calculation failure: max price liquidity calculation exception
 * @throws {Error} Order data format error: order object missing required fields
 */
function calcLiqTokenBuy(price, buyTokenAmount, orders, onceMaxOrder, passOrder = null, initialVirtualSol = null, initialVirtualToken = null) {
  // Since this is a buy operation, the orders are definitely in the up_orders direction  lock_lp_start_price <  lock_lp_end_price
  // And lock_lp_start_price is sorted in ascending order in orders

  // Parameter validation
  if (!price && price !== 0) {
    throw new Error('参数验证错误：price 参数不能为空 Parameter validation error: price cannot be null');
  }
  if (!buyTokenAmount && buyTokenAmount !== 0) {
    throw new Error('参数验证错误：buyTokenAmount 参数不能为空 Parameter validation error: buyTokenAmount cannot be null');
  }
  if (!Array.isArray(orders)) {
    throw new Error('参数验证错误：orders 必须是数组 Parameter validation error: orders must be an array');
  }
  if (!onceMaxOrder || onceMaxOrder <= 0) {
    throw new Error('参数验证错误：onceMaxOrder 必须是正数 Parameter validation error: onceMaxOrder must be a positive number');
  }
  if (initialVirtualSol === null || initialVirtualToken === null) {
    throw new Error('参数验证错误：initialVirtualSol 和 initialVirtualToken 不能为空 Parameter validation error: initialVirtualSol and initialVirtualToken cannot be null');
  }

  const result = {
    free_lp_sol_amount_sum: 0n,  // Amount of SOL liquidity usable in the gaps
    free_lp_token_amount_sum: 0n, // Amount of token liquidity usable in the gaps
    lock_lp_sol_amount_sum: 0n,
    lock_lp_token_amount_sum: 0n,
    has_infinite_lp: false, // Whether includes infinite liquidity
    pass_order_id: -1, // Index of skipped order
    force_close_num: 0, // Number of force closed orders
    ideal_lp_sol_amount: 0n, // Amount of SOL used to buy buyTokenAmount under ideal conditions
    real_lp_sol_amount: 0n, // Amount of SOL actually used to buy buyTokenAmount
  }




  let buyTokenAmountBigInt;
  try {
    buyTokenAmountBigInt = BigInt(buyTokenAmount);
  } catch (error) {
    throw new Error(`价格转换错误：无法将 buyTokenAmount 转换为 BigInt Price conversion error: Cannot convert buyTokenAmount to BigInt - ${error.message}`);
  }

  // Declare variable for tracking the previous free liquidity total
  let prev_free_lp_sol_amount_sum;

  //result.ideal_lp_token_amount_sum = buyTokenAmountBigInt;

  try {
    const priceBigInt = BigInt(price);
    const initialVirtualSolDecimal = new Decimal(initialVirtualSol).div(CurveAMM.SOL_PRECISION_FACTOR_DECIMAL);
    const initialVirtualTokenDecimal = new Decimal(initialVirtualToken).div(CurveAMM.TOKEN_PRECISION_FACTOR_DECIMAL);

    [, result.ideal_lp_sol_amount] = CurveAMM.buyFromPriceWithTokenOutputWithParams(
      priceBigInt,
      buyTokenAmountBigInt,
      initialVirtualSolDecimal,
      initialVirtualTokenDecimal
    );
    // console.log(`ideal calculation: current price=${priceBigInt}, target token=${buyTokenAmountBigInt}, ideal SOL=${result.ideal_lp_sol_amount}`);
  } catch (error) {
    throw new Error(`buy流动性计算错误：理想流动性计算失败 Liquidity calculation error: Ideal liquidity calculation failed - ${error.message}`);
  }


  // orders length of 0 requires separate calculation
  if (orders.length === 0) {
    

    const initialVirtualSolDecimal = new Decimal(initialVirtualSol).div(CurveAMM.SOL_PRECISION_FACTOR_DECIMAL);
    const initialVirtualTokenDecimal = new Decimal(initialVirtualToken).div(CurveAMM.TOKEN_PRECISION_FACTOR_DECIMAL);


    [result.free_lp_sol_amount_sum, result.free_lp_token_amount_sum] = CurveAMM.buyFromPriceToPriceWithParams(
      BigInt(price),
      CurveAMM.MAX_U128_PRICE,
      initialVirtualSolDecimal,
      initialVirtualTokenDecimal
    );
    result.has_infinite_lp = true;
    result.real_lp_sol_amount = result.ideal_lp_sol_amount
    return result
  }




  // Choose the smaller value for traversal
  const loopCount = Math.min(orders.length, onceMaxOrder);

  let counti = 0;
  for (let i = 0; i < loopCount; i++) {
    const order = orders[i];

    // Validate order data format
    if (!order) {
      throw new Error(`订单数据格式错误：订单 ${i} 为空 Order data format error: Order ${i} is null`);
    }
    if (!order.lock_lp_start_price) {
      throw new Error(`订单数据格式错误：订单 ${i} 缺少 lock_lp_start_price Order data format error: Order ${i} missing lock_lp_start_price`);
    }
    if (!order.lock_lp_end_price) {
      throw new Error(`订单数据格式错误：订单 ${i} 缺少 lock_lp_end_price Order data format error: Order ${i} missing lock_lp_end_price`);
    }


    // Calculate gap liquidity
    let startPrice, endPrice;
    try {
      if (i === 0) {
        // First order: use the gap from current price to order start price
        startPrice = BigInt(price);
        endPrice = BigInt(order.lock_lp_start_price);
      } else {
        // Subsequent orders: use the gap from previous order end price to current order start price
        startPrice = BigInt(orders[i - 1].lock_lp_end_price);
        endPrice = BigInt(order.lock_lp_start_price);
      }
    } catch (error) {
      throw new Error(`价格转换错误：无法转换订单 ${i} 的价格数据 Price conversion error: Cannot convert price data for order ${i} - ${error.message}`);
    }


    // If a price gap exists, calculate free liquidity
    if (endPrice > startPrice) {
      try {
        const initialVirtualSolDecimal = new Decimal(initialVirtualSol).div(CurveAMM.SOL_PRECISION_FACTOR_DECIMAL);
        const initialVirtualTokenDecimal = new Decimal(initialVirtualToken).div(CurveAMM.TOKEN_PRECISION_FACTOR_DECIMAL);
        const gapLiquidity = CurveAMM.buyFromPriceToPriceWithParams(
          startPrice,
          endPrice,
          initialVirtualSolDecimal,
          initialVirtualTokenDecimal
        );
        if (gapLiquidity && Array.isArray(gapLiquidity) && gapLiquidity.length === 2) {
          const [solAmount, tokenAmount] = gapLiquidity;

          try {
            prev_free_lp_sol_amount_sum = result.free_lp_sol_amount_sum; // Previous value
            result.free_lp_sol_amount_sum += BigInt(solAmount);
            result.free_lp_token_amount_sum += BigInt(tokenAmount);
            // console.log(`gap[${i}]: ${startPrice}→${endPrice}, gap SOL=${solAmount}, gap Token=${tokenAmount}, cumulative free Token=${result.free_lp_token_amount_sum}`);
          } catch (error) {
            throw new Error(`流动性计算错误：无法转换间隙流动性数值 Liquidity calculation error: Cannot convert gap liquidity values - ${error.message}`);
          }


          // Calculate the actual amount of SOL used, until enough can be bought
          if (result.real_lp_sol_amount === 0n) {
            if (result.free_lp_token_amount_sum > buyTokenAmountBigInt) {
              // At this point the gap liquidity is already enough to buy
              // Calculate the final precise amount of token to buy
              try {
                const actualBuyAmount = buyTokenAmountBigInt - (result.free_lp_token_amount_sum - BigInt(tokenAmount));
                // console.log("actualBuyAmount",actualBuyAmount)
                const [, preciseSol] = CurveAMM.buyFromPriceWithTokenOutput(startPrice, actualBuyAmount)
                result.real_lp_sol_amount = prev_free_lp_sol_amount_sum + BigInt(preciseSol);

                // console.log(`actual calculation[${i}]: free liquidity sufficient, actualBuyAmount=${actualBuyAmount}, preciseSol=${preciseSol}, actual SOL=${result.real_lp_sol_amount}`);
                result.force_close_num = counti; // Number of force closed orders
              } catch (error) {
                // console.log('error details:', error);
                throw new Error(`流动性计算错误：精确SOL计算失败 Liquidity calculation error: Precise SOL calculation failed - ${error.message}`);
              }
            }
          }

        } else {
          throw new Error(`间隙流动性计算失败：返回数据格式错误 Gap liquidity calculation failure: Invalid return data format`);
        }
      } catch (error) {
        if (error.message.includes('间隙流动性计算失败') || error.message.includes('流动性计算错误')) {
          throw error;
        }
        throw new Error(`间隙流动性计算失败：${error.message} Gap liquidity calculation failure: ${error.message}`);
      }
    } else {
    }

    // Check whether this order needs to be skipped (passOrder logic)
    //const shouldSkipOrder = passOrder && typeof passOrder === 'string' && order.order_pda === passOrder;


    if (passOrder == order.order_pda) {

      // Add the skipped order's liquidity to the free liquidity
      try {
        if (order.lock_lp_sol_amount === undefined || order.lock_lp_sol_amount === null) {
          throw new Error(`订单数据格式错误：跳过订单 ${i} 缺少 lock_lp_sol_amount Order data format error: Skipped order ${i} missing lock_lp_sol_amount`);
        }
        if (order.lock_lp_token_amount === undefined || order.lock_lp_token_amount === null) {
          throw new Error(`订单数据格式错误：跳过订单 ${i} 缺少 lock_lp_token_amount Order data format error: Skipped order ${i} missing lock_lp_token_amount`);
        }

        const prevFreeSolSum = result.free_lp_sol_amount_sum; // Save the previous value for calculation
        result.free_lp_sol_amount_sum += BigInt(order.lock_lp_sol_amount);
        result.free_lp_token_amount_sum += BigInt(order.lock_lp_token_amount);

        result.pass_order_id = i;


        // Check whether the free liquidity after skipping the order already meets the buy requirement
        if (result.real_lp_sol_amount === 0n) {
          if (result.free_lp_token_amount_sum >= buyTokenAmountBigInt) {
            // Free liquidity is already enough for the buy requirement
            try {
              //const remainingToken = result.free_lp_token_amount_sum - buyTokenAmountBigInt;
              // Calculate from the current price how much SOL is needed to buy the precise token amount
              const targetPrice = i === 0 ? BigInt(price) : BigInt(orders[i - 1].lock_lp_end_price);
              const actualBuyAmount = buyTokenAmountBigInt - (result.free_lp_token_amount_sum - BigInt(order.lock_lp_token_amount));
              const [, preciseSol] = CurveAMM.buyFromPriceWithTokenOutput(targetPrice, actualBuyAmount);
              result.real_lp_sol_amount = prevFreeSolSum + BigInt(preciseSol);
              // console.log(`actual calculation[${i}]: sufficient after skipping order, targetPrice=${targetPrice}, preciseSol=${preciseSol}, actual SOL=${result.real_lp_sol_amount}`);
              result.force_close_num = counti;
            } catch (error) {
              throw new Error(`流动性计算错误：跳过订单后精确SOL计算失败 Liquidity calculation error: Precise SOL calculation failed after skipping order - ${error.message}`);
            }
          }
        }

      } catch (error) {
        if (error.message.includes('订单数据格式错误') || error.message.includes('流动性计算错误')) {
          throw error;
        }
        throw new Error(`流动性计算错误：无法处理跳过订单 ${i} 的流动性 Liquidity calculation error: Cannot process skipped order ${i} liquidity - ${error.message}`);
      }
    } else {
      // Accumulate locked liquidity (normal case)
      try {
        if (order.lock_lp_sol_amount === undefined || order.lock_lp_sol_amount === null) {
          throw new Error(`订单数据格式错误：订单 ${i} 缺少 lock_lp_sol_amount Order data format error: Order ${i} missing lock_lp_sol_amount`);
        }
        if (order.lock_lp_token_amount === undefined || order.lock_lp_token_amount === null) {
          throw new Error(`订单数据格式错误：订单 ${i} 缺少 lock_lp_token_amount Order data format error: Order ${i} missing lock_lp_token_amount`);
        }

        result.lock_lp_sol_amount_sum += BigInt(order.lock_lp_sol_amount);
        result.lock_lp_token_amount_sum += BigInt(order.lock_lp_token_amount);
      } catch (error) {
        if (error.message.includes('订单数据格式错误')) {
          throw error;
        }
        throw new Error(`流动性计算错误：无法累加订单 ${i} 的锁定流动性 Liquidity calculation error: Cannot accumulate locked liquidity for order ${i} - ${error.message}`);
      }

      counti += 1;
    }




  }

  // If the number of traversed orders is less than or equal to onceMaxOrder, the chain has ended and infinite liquidity needs to be calculated
  if (orders.length <= onceMaxOrder && orders.length > 0) {

    const lastOrder = orders[orders.length - 1];
    if (!lastOrder || !lastOrder.lock_lp_end_price) {
      throw new Error(`订单数据格式错误：最后一个订单缺少 lock_lp_end_price Order data format error: Last order missing lock_lp_end_price`);
    }

    let lastEndPrice, maxPrice;
    try {
      lastEndPrice = BigInt(lastOrder.lock_lp_end_price);
      maxPrice = CurveAMM.MAX_U128_PRICE;
    } catch (error) {
      throw new Error(`价格转换错误：无法转换最后订单价格或最大价格 Price conversion error: Cannot convert last order price or max price - ${error.message}`);
    }


    if (maxPrice > lastEndPrice) {
      try {
        const initialVirtualSolDecimal = new Decimal(initialVirtualSol).div(CurveAMM.SOL_PRECISION_FACTOR_DECIMAL);
        const initialVirtualTokenDecimal = new Decimal(initialVirtualToken).div(CurveAMM.TOKEN_PRECISION_FACTOR_DECIMAL);
        const infiniteLiquidity = CurveAMM.buyFromPriceToPriceWithParams(
          lastEndPrice,
          maxPrice,
          initialVirtualSolDecimal,
          initialVirtualTokenDecimal
        );
        if (infiniteLiquidity && Array.isArray(infiniteLiquidity) && infiniteLiquidity.length === 2) {
          const [solAmount, tokenAmount] = infiniteLiquidity;

          try {
            result.free_lp_sol_amount_sum += BigInt(solAmount);
            result.free_lp_token_amount_sum += BigInt(tokenAmount);
            result.has_infinite_lp = true;
          } catch (error) {
            throw new Error(`流动性计算错误：无法转换无限流动性数值 Liquidity calculation error: Cannot convert infinite liquidity values - ${error.message}`);
          }

          // After entering infinite liquidity, also calculate the actual amount of SOL used, until enough can be bought
          if (result.real_lp_sol_amount === 0n) {
            if (result.free_lp_token_amount_sum > buyTokenAmountBigInt) {
              // At this point the gap liquidity is already enough to buy
              // Calculate the final precise amount of token to buy
              try {
                const actualBuyAmount = buyTokenAmountBigInt - (result.free_lp_token_amount_sum - BigInt(tokenAmount));
                const [, preciseSol] = CurveAMM.buyFromPriceWithTokenOutput(lastEndPrice, actualBuyAmount)
                result.real_lp_sol_amount += BigInt(preciseSol);
                result.force_close_num = counti; // Number of force closed orders
              } catch (error) {
                throw new Error(`流动性计算错误：无限流动性精确SOL计算失败 Liquidity calculation error: Infinite liquidity precise SOL calculation failed - ${error.message}`);
              }
            }
          }

        } else {
          throw new Error(`无限流动性计算失败：返回数据格式错误 Infinite liquidity calculation failure: Invalid return data format`);
        }
      } catch (error) {
        if (error.message.includes('无限流动性计算失败') || error.message.includes('流动性计算错误') || error.message.includes('订单数据格式错误') || error.message.includes('价格转换错误')) {
          throw error;
        }
        throw new Error(`无限流动性计算失败：${error.message} Infinite liquidity calculation failure: ${error.message}`);
      }
    }
  }

  return result;

}




/**
 * Calculate liquidity impact for token sell operations
 *
 * This function analyzes the liquidity impact of sell operations within price ranges,
 * calculates available free liquidity, locked liquidity, and supports skipping specific
 * orders (treating their liquidity as available). Applicable for short orders (down_orders) scenarios.
 *
 * @param {bigint|string|number} price - Current token price, used as calculation start price
 * @param {bigint|string|number} sellTokenAmount - Amount of tokens to sell, target sell amount
 * @param {Array<Object>} orders - Array of orders sorted by lock_lp_start_price (descending):
 *   - order_type: {number} Order type (1=long, 2=short)
 *   - mint: {string} Token mint address
 *   - user: {string} User address
 *   - lock_lp_start_price: {string} LP lock start price (high price) (required)
 *   - lock_lp_end_price: {string} LP lock end price (low price) (required)
 *   - lock_lp_sol_amount: {number} Locked SOL amount (required)
 *   - lock_lp_token_amount: {number} Locked token amount (required)
 *   - start_time: {number} Start timestamp
 *   - end_time: {number} End timestamp
 *   - margin_sol_amount: {number} Margin SOL amount
 *   - borrow_amount: {number} Borrow amount
 *   - position_asset_amount: {number} Position asset amount
 *   - borrow_fee: {number} Borrow fee
 *   - order_pda: {string} Order PDA address (required for passOrder matching)
 * @param {number} onceMaxOrder - Maximum orders to process at once, limits traversal range
 * @param {string|null} passOrder - Order PDA address string to skip, when this value matches an order's order_pda, skip that order and count its liquidity as free liquidity
 *
 * @returns {Object} Liquidity calculation result object with detailed liquidity analysis data:
 *
 *   **Free Liquidity:**
 *   - free_lp_sol_amount_sum: {bigint} Total available free liquidity SOL amount, represents SOL obtainable from selling, includes: 1) price gap liquidity 2) skipped order liquidity 3) infinite liquidity (if any)
 *   - free_lp_token_amount_sum: {bigint} Total available free liquidity token amount, represents max tokens sellable without force closing any orders
 *
 *   **Locked Liquidity:**
 *   - lock_lp_sol_amount_sum: {bigint} Total locked liquidity SOL amount, excludes skipped orders, this liquidity is not directly usable
 *   - lock_lp_token_amount_sum: {bigint} Total locked liquidity token amount, excludes skipped orders, corresponds to locked SOL liquidity
 *
 *   **Liquidity Status Indicators:**
 *   - has_infinite_lp: {boolean} Whether includes infinite liquidity, true means order chain ended and liquidity to min price (MIN_U128_PRICE) was calculated
 *   - pass_order_id: {number} Index of skipped order in array, -1 means no order skipped, >=0 means order at that index was skipped
 *
 *   **Sell Execution Info:**
 *   - force_close_num: {number} Number of orders that need to be force closed, indicates how many orders need force closure to sell target amount, 0 means no force closure needed
 *   - ideal_lp_sol_amount: {bigint} Ideal SOL amount obtainable, theoretical maximum SOL revenue calculated directly from current price using CurveAMM, ignores liquidity distribution
 *   - real_lp_sol_amount: {bigint} Actual SOL amount obtainable, precise SOL revenue considering real liquidity distribution. 0 means current free liquidity insufficient for sell requirement, need to force close more orders
 *
 * @throws {Error} Parameter validation error: invalid price, sellTokenAmount, orders, or onceMaxOrder
 * @throws {Error} Price conversion error: cannot convert price parameters to BigInt
 * @throws {Error} Liquidity calculation error: CurveAMM calculation failure or value conversion error
 * @throws {Error} Gap liquidity calculation failure: price gap liquidity calculation exception
 * @throws {Error} Infinite liquidity calculation failure: min price liquidity calculation exception
 * @throws {Error} Order data format error: order object missing required fields
 */
function calcLiqTokenSell(price, sellTokenAmount, orders, onceMaxOrder, passOrder = null, initialVirtualSol = null, initialVirtualToken = null) {
  // Since this is a sell operation, the orders are definitely in the down_orders direction  lock_lp_start_price >  lock_lp_end_price
  // And lock_lp_start_price is sorted in descending order in orders

  // Parameter validation
  if (!price && price !== 0) {
    throw new Error('参数验证错误：price 参数不能为空 Parameter validation error: price cannot be null');
  }
  if (!sellTokenAmount && sellTokenAmount !== 0) {
    throw new Error('参数验证错误：sellTokenAmount 参数不能为空 Parameter validation error: sellTokenAmount cannot be null');
  }
  if (!Array.isArray(orders)) {
    throw new Error('参数验证错误：orders 必须是数组 Parameter validation error: orders must be an array');
  }
  if (!onceMaxOrder || onceMaxOrder <= 0) {
    throw new Error('参数验证错误：onceMaxOrder 必须是正数 Parameter validation error: onceMaxOrder must be a positive number');
  }
  if (initialVirtualSol === null || initialVirtualToken === null) {
    throw new Error('参数验证错误：initialVirtualSol 和 initialVirtualToken 不能为空 Parameter validation error: initialVirtualSol and initialVirtualToken cannot be null');
  }

  const result = {
    free_lp_sol_amount_sum: 0n,  // Amount of SOL liquidity usable in the gaps
    free_lp_token_amount_sum: 0n, // Amount of token liquidity usable in the gaps
    lock_lp_sol_amount_sum: 0n,
    lock_lp_token_amount_sum: 0n,
    has_infinite_lp: false, // Whether includes infinite liquidity
    pass_order_id: -1, // Index of skipped order
    force_close_num: 0, // Number of force closed orders
    ideal_lp_sol_amount: 0n, // Amount of SOL obtainable from selling sellTokenAmount under ideal conditions
    real_lp_sol_amount: 0n, // Amount of SOL actually obtainable from selling sellTokenAmount
  }

  let sellTokenAmountBigInt;
  try {
    sellTokenAmountBigInt = BigInt(sellTokenAmount);
  } catch (error) {
    throw new Error(`价格转换错误：无法将 sellTokenAmount 转换为 BigInt Price conversion error: Cannot convert sellTokenAmount to BigInt - ${error.message}`);
  }

  // Declare variable for tracking the previous free liquidity total
  let prev_free_lp_sol_amount_sum;

  // Calculate the amount of SOL obtainable from selling under ideal conditions
  try {
    const priceBigInt = BigInt(price);
    const initialVirtualSolDecimal = new Decimal(initialVirtualSol).div(CurveAMM.SOL_PRECISION_FACTOR_DECIMAL);
    const initialVirtualTokenDecimal = new Decimal(initialVirtualToken).div(CurveAMM.TOKEN_PRECISION_FACTOR_DECIMAL);

    //console.log("initialVirtualSolDecimal,initialVirtualTokenDecimal = ",initialVirtualSolDecimal.toString(),initialVirtualTokenDecimal.toString());
    [, result.ideal_lp_sol_amount] = CurveAMM.sellFromPriceWithTokenInputWithParams(
      priceBigInt,
      sellTokenAmountBigInt,
      initialVirtualSolDecimal,
      initialVirtualTokenDecimal
    );
    // console.log(`ideal calculation: current price=${priceBigInt}, sell token=${sellTokenAmountBigInt}, ideal SOL=${result.ideal_lp_sol_amount}`);
  } catch (error) {
    throw new Error(`sell流动性计算错误：理想流动性计算失败 Liquidity calculation error: Ideal liquidity calculation failed - ${error.message}`);
  }

  // orders length of 0 requires separate calculation
  if (orders.length === 0) {
    const initialVirtualSolDecimal = new Decimal(initialVirtualSol).div(CurveAMM.SOL_PRECISION_FACTOR_DECIMAL);
    const initialVirtualTokenDecimal = new Decimal(initialVirtualToken).div(CurveAMM.TOKEN_PRECISION_FACTOR_DECIMAL);
    const sellResult = CurveAMM.sellFromPriceToPriceWithParams(
      BigInt(price),
      CurveAMM.MIN_U128_PRICE,
      initialVirtualSolDecimal,
      initialVirtualTokenDecimal
    );
    if (sellResult) {
      [result.free_lp_token_amount_sum, result.free_lp_sol_amount_sum] = sellResult;
    } else {
      // If the current price is already below the minimum price, no more can be sold
      result.free_lp_token_amount_sum = 0n;
      result.free_lp_sol_amount_sum = 0n;
    }
    result.has_infinite_lp = true;
    result.real_lp_sol_amount = result.ideal_lp_sol_amount
    return result
  }




  // Choose the smaller value for traversal
  const loopCount = Math.min(orders.length, onceMaxOrder);

  let counti = 0;
  for (let i = 0; i < loopCount; i++) {
    const order = orders[i];
    // console.log(`processing sell order[${i}]: cumulative free Token=${result.free_lp_token_amount_sum}, target=${sellTokenAmountBigInt}, needed=${sellTokenAmountBigInt > result.free_lp_token_amount_sum}`);

    // Validate order data format
    if (!order) {
      throw new Error(`订单数据格式错误：订单 ${i} 为空 Order data format error: Order ${i} is null`);
    }
    if (!order.lock_lp_start_price) {
      throw new Error(`订单数据格式错误：订单 ${i} 缺少 lock_lp_start_price Order data format error: Order ${i} missing lock_lp_start_price`);
    }
    if (!order.lock_lp_end_price) {
      throw new Error(`订单数据格式错误：订单 ${i} 缺少 lock_lp_end_price Order data format error: Order ${i} missing lock_lp_end_price`);
    }


    // Calculate gap liquidity (sell direction: from high price to low price)
    let startPrice, endPrice;
    try {
      if (i === 0) {
        // First order: gap from current price (high) to order start price (low)
        startPrice = BigInt(price);
        endPrice = BigInt(order.lock_lp_start_price);
      } else {
        // Subsequent orders: gap from previous order end price (high) to current order start price (low)
        startPrice = BigInt(orders[i - 1].lock_lp_end_price);
        endPrice = BigInt(order.lock_lp_start_price);
      }
    } catch (error) {
      throw new Error(`价格转换错误：无法转换订单 ${i} 的价格数据 Price conversion error: Cannot convert price data for order ${i} - ${error.message}`);
    }


    // If a price gap exists (when selling, startPrice should be greater than endPrice)
    if (startPrice > endPrice) {
      try {
        const initialVirtualSolDecimal = new Decimal(initialVirtualSol).div(CurveAMM.SOL_PRECISION_FACTOR_DECIMAL);
        const initialVirtualTokenDecimal = new Decimal(initialVirtualToken).div(CurveAMM.TOKEN_PRECISION_FACTOR_DECIMAL);
        const gapLiquidity = CurveAMM.sellFromPriceToPriceWithParams(
          startPrice,
          endPrice,
          initialVirtualSolDecimal,
          initialVirtualTokenDecimal
        );
        if (gapLiquidity && Array.isArray(gapLiquidity) && gapLiquidity.length === 2) {
          const [tokenAmount, solAmount] = gapLiquidity;

          try {
            prev_free_lp_sol_amount_sum = result.free_lp_sol_amount_sum; // Previous value
            result.free_lp_sol_amount_sum += BigInt(solAmount);
            result.free_lp_token_amount_sum += BigInt(tokenAmount);
            // console.log(`sell gap[${i}]: ${startPrice}→${endPrice}, gap Token=${tokenAmount}, gap SOL=${solAmount}, cumulative free Token=${result.free_lp_token_amount_sum}`);
          } catch (error) {
            throw new Error(`流动性计算错误：无法转换间隙流动性数值 Liquidity calculation error: Cannot convert gap liquidity values - ${error.message}`);
          }

          // Calculate the actual amount of SOL obtained, until enough can be sold
          if (result.real_lp_sol_amount === 0n) {
            if (result.free_lp_token_amount_sum >= sellTokenAmountBigInt) {
              // At this point the gap liquidity is already enough to sell
              // Calculate the precise amount of SOL obtainable
              try {
                const actualSellAmount = sellTokenAmountBigInt - (result.free_lp_token_amount_sum - BigInt(tokenAmount));
                const [, preciseSol] = CurveAMM.sellFromPriceWithTokenInput(startPrice, actualSellAmount);
                result.real_lp_sol_amount = prev_free_lp_sol_amount_sum + preciseSol;
                // console.log(`sell actual calculation[${i}]: free liquidity sufficient, actualSellAmount=${actualSellAmount}, preciseSol=${preciseSol}, actual SOL=${result.real_lp_sol_amount}`);
                result.force_close_num = counti; // Number of force closed orders
              } catch (error) {
                throw new Error(`流动性计算错误：精确SOL计算失败 Liquidity calculation error: Precise SOL calculation failed - ${error.message}`);
              }
            }
          }

        } else {
          throw new Error(`间隙流动性计算失败：返回数据格式错误 Gap liquidity calculation failure: Invalid return data format`);
        }
      } catch (error) {
        if (error.message.includes('间隙流动性计算失败') || error.message.includes('流动性计算错误')) {
          throw error;
        }
        throw new Error(`间隙流动性计算失败：${error.message} Gap liquidity calculation failure: ${error.message}`);
      }
    } else {
    }

    // Check whether this order needs to be skipped (passOrder logic)

    if (passOrder == order.order_pda) {

      // Add the skipped order's liquidity to the free liquidity
      try {
        if (order.lock_lp_sol_amount === undefined || order.lock_lp_sol_amount === null) {
          throw new Error(`订单数据格式错误：跳过订单 ${i} 缺少 lock_lp_sol_amount Order data format error: Skipped order ${i} missing lock_lp_sol_amount`);
        }
        if (order.lock_lp_token_amount === undefined || order.lock_lp_token_amount === null) {
          throw new Error(`订单数据格式错误：跳过订单 ${i} 缺少 lock_lp_token_amount Order data format error: Skipped order ${i} missing lock_lp_token_amount`);
        }

        const prevFreeSolSum = result.free_lp_sol_amount_sum; // Save the previous value for calculation
        result.free_lp_sol_amount_sum += BigInt(order.lock_lp_sol_amount);
        result.free_lp_token_amount_sum += BigInt(order.lock_lp_token_amount);

        result.pass_order_id = i;


        // Check whether the free liquidity after skipping the order already meets the sell requirement
        if (result.real_lp_sol_amount === 0n) {
          if (result.free_lp_token_amount_sum >= sellTokenAmountBigInt) {
            // Free liquidity is already enough for the sell requirement
            try {
              // Calculate the precise amount of SOL obtainable
              const targetPrice = i === 0 ? BigInt(price) : BigInt(orders[i - 1].lock_lp_end_price);
              const actualSellAmount = sellTokenAmountBigInt - (result.free_lp_token_amount_sum - BigInt(order.lock_lp_token_amount));
              const [, preciseSol] = CurveAMM.sellFromPriceWithTokenInput(targetPrice, actualSellAmount);
              result.real_lp_sol_amount = prevFreeSolSum + preciseSol;
              result.force_close_num = counti;
            } catch (error) {
              throw new Error(`流动性计算错误：跳过订单后精确SOL计算失败 Liquidity calculation error: Precise SOL calculation failed after skipping order - ${error.message}`);
            }
          }
        }

      } catch (error) {
        if (error.message.includes('订单数据格式错误') || error.message.includes('流动性计算错误')) {
          throw error;
        }
        throw new Error(`流动性计算错误：无法处理跳过订单 ${i} 的流动性 Liquidity calculation error: Cannot process skipped order ${i} liquidity - ${error.message}`);
      }
    } else {
      // Accumulate locked liquidity (normal case)
      try {
        if (order.lock_lp_sol_amount === undefined || order.lock_lp_sol_amount === null) {
          throw new Error(`订单数据格式错误：订单 ${i} 缺少 lock_lp_sol_amount Order data format error: Order ${i} missing lock_lp_sol_amount`);
        }
        if (order.lock_lp_token_amount === undefined || order.lock_lp_token_amount === null) {
          throw new Error(`订单数据格式错误：订单 ${i} 缺少 lock_lp_token_amount Order data format error: Order ${i} missing lock_lp_token_amount`);
        }

        result.lock_lp_sol_amount_sum += BigInt(order.lock_lp_sol_amount);
        result.lock_lp_token_amount_sum += BigInt(order.lock_lp_token_amount);
      } catch (error) {
        if (error.message.includes('订单数据格式错误')) {
          throw error;
        }
        throw new Error(`流动性计算错误：无法累加订单 ${i} 的锁定流动性 Liquidity calculation error: Cannot accumulate locked liquidity for order ${i} - ${error.message}`);
      }

      counti += 1;
    }

  }

  // If the number of traversed orders is less than or equal to onceMaxOrder, the chain has ended and infinite liquidity needs to be calculated
  if (orders.length <= onceMaxOrder && orders.length > 0) {

    const lastOrder = orders[orders.length - 1];
    if (!lastOrder || !lastOrder.lock_lp_end_price) {
      throw new Error(`订单数据格式错误：最后一个订单缺少 lock_lp_end_price Order data format error: Last order missing lock_lp_end_price`);
    }

    let lastEndPrice, minPrice;
    try {
      lastEndPrice = BigInt(lastOrder.lock_lp_end_price);
      minPrice = CurveAMM.MIN_U128_PRICE;
    } catch (error) {
      throw new Error(`价格转换错误：无法转换最后订单价格或最小价格 Price conversion error: Cannot convert last order price or min price - ${error.message}`);
    }


    if (lastEndPrice > minPrice) {

      try {
        const initialVirtualSolDecimal = new Decimal(initialVirtualSol).div(CurveAMM.SOL_PRECISION_FACTOR_DECIMAL);
        const initialVirtualTokenDecimal = new Decimal(initialVirtualToken).div(CurveAMM.TOKEN_PRECISION_FACTOR_DECIMAL);
        const infiniteLiquidity = CurveAMM.sellFromPriceToPriceWithParams(
          lastEndPrice,
          minPrice,
          initialVirtualSolDecimal,
          initialVirtualTokenDecimal
        );
        if (infiniteLiquidity && Array.isArray(infiniteLiquidity) && infiniteLiquidity.length === 2) {
          const [tokenAmount, solAmount] = infiniteLiquidity;

          let prevFreeSolSum;
          try {
            prevFreeSolSum = result.free_lp_sol_amount_sum;
            result.free_lp_sol_amount_sum += BigInt(solAmount);
            result.free_lp_token_amount_sum += BigInt(tokenAmount);
            result.has_infinite_lp = true;
          } catch (error) {
            throw new Error(`流动性计算错误：无法转换无限流动性数值 Liquidity calculation error: Cannot convert infinite liquidity values - ${error.message}`);
          }

          // After entering infinite liquidity, calculate the actual amount of SOL obtained
          if (result.real_lp_sol_amount === 0n) {
            if (result.free_lp_token_amount_sum >= sellTokenAmountBigInt) {
              // Infinite liquidity is enough for the sell requirement
              try {
                const actualSellAmount = sellTokenAmountBigInt - (result.free_lp_token_amount_sum - BigInt(tokenAmount));
                const [, preciseSol] = CurveAMM.sellFromPriceWithTokenInput(lastEndPrice, actualSellAmount);
                result.real_lp_sol_amount = prevFreeSolSum + preciseSol;
                result.force_close_num = counti; // Number of force closed orders
              } catch (error) {
                throw new Error(`流动性计算错误：无限流动性精确SOL计算失败 Liquidity calculation error: Infinite liquidity precise SOL calculation failed - ${error.message}`);
              }
            }
          }

        } else {
          throw new Error(`无限流动性计算失败a：返回数据格式错误 Infinite liquidity calculation failure: Invalid return data format`);
        }
      } catch (error) {
        if (error.message.includes('无限流动性计算失败') || error.message.includes('流动性计算错误') || error.message.includes('订单数据格式错误') || error.message.includes('价格转换错误')) {
          throw error;
        }
        throw new Error(`无限流动性计算失败b：${error.message} Infinite liquidity calculation failure: ${error.message}`);
      }
    }
  }

  return result;
}

module.exports = {
  calcLiqTokenBuy,
  calcLiqTokenSell
};


