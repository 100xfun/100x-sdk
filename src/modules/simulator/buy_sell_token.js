

const { calcLiqTokenBuy, calcLiqTokenSell } = require('./calcLiq');

/**
 * Simulate token buy transaction - calculate if target token amount can be purchased
 * @param {string} mint - Token address
 * @param {bigint|string|number} buyTokenAmount - Target token amount to buy
 * @param {string} passOrder - Optional order address to skip (won't be liquidated)
 * @param {Object|null} lastPrice - Token price info, default null
 * @param {Object|null} ordersData - Orders response object, default null
 * @returns {Promise<Object>} Token buy simulation result with the following structure:
 *   - liqResult: {Object} Complete liquidity calculation result from calcLiqTokenBuy, containing:
 *     - free_lp_sol_amount_sum: {bigint} Total available free liquidity SOL amount
 *     - free_lp_token_amount_sum: {bigint} Total available free liquidity token amount
 *     - lock_lp_sol_amount_sum: {bigint} Total locked liquidity SOL amount
 *     - lock_lp_token_amount_sum: {bigint} Total locked liquidity token amount
 *     - has_infinite_lp: {boolean} Whether includes infinite liquidity beyond last order
 *     - pass_order_id: {number} Index of skipped order in array (-1 if none skipped)
 *     - force_close_num: {number} Number of orders that need force closure for target amount
 *     - ideal_lp_sol_amount: {bigint} Theoretical minimum SOL required at current price
 *     - real_lp_sol_amount: {bigint} Actual SOL required considering real liquidity distribution
 *   - completion: {string} Purchase completion percentage as decimal string (e.g., "85.2", "100.0")
 *   - slippage: {string} Price slippage percentage as decimal string (e.g., "2.5", "0.8")
 *   - suggestedTokenAmount: {string} Recommended token amount to buy based on available liquidity
 *   - suggestedSolAmount: {string} Required SOL amount for suggested token purchase
 */
async function simulateTokenBuy(mint, buyTokenAmount, passOrder = null, lastPrice = null, ordersData = null, curveData = null) {
  // Get price and orders data

  //console.log('simulateTokenBuy', mint, buyTokenAmount, passOrder, lastPrice, ordersData);

  let price = lastPrice;
  if (!price) {
    price = await this.sdk.data.price(mint);
  }

  let orders;
  if (!ordersData) {
    const ordersResponse = await this.sdk.data.orders(mint, {
      type: 'up_orders',
      limit: this.sdk.MAX_ORDERS_COUNT + 1
    });
    // Extract the actual orders array
    orders = ordersResponse.data.orders;
  } else {
    // If ordersData is provided, extract the orders array from the response object and limit its length
    orders = ordersData.data.orders.slice(0, this.sdk.MAX_ORDERS_COUNT + 1);
  }

  // Get dynamic liquidity pool parameters (supports external input to avoid duplicate requests)
  if (!curveData) {
    try {
      curveData = await this.sdk.chain.getCurveAccount(mint, { skipBalances: true });
    } catch (error) {
      throw new Error(`Failed to get curve account data: ${error.message}`);
    }
  }

  // Call calcLiqTokenBuy to perform liquidity calculation (passing dynamic liquidity pool parameters)
  try {
    const liqResult = calcLiqTokenBuy(
      price,
      buyTokenAmount,
      orders,
      this.sdk.MAX_ORDERS_COUNT,
      passOrder,
      curveData.initialVirtualSol,
      curveData.initialVirtualToken
    );

    // console.log("liqResult:",liqResult);


    // console.log('\n=== calcLiqTokenBuy return result ===');
    // console.log('Free liquidity SOL total:', liqResult.free_lp_sol_amount_sum.toString());
    // console.log('Free liquidity Token total:', liqResult.free_lp_token_amount_sum.toString());
    // console.log('Locked liquidity SOL total:', liqResult.lock_lp_sol_amount_sum.toString());
    // console.log('Locked liquidity Token total:', liqResult.lock_lp_token_amount_sum.toString());
    // console.log('Whether includes infinite liquidity:', liqResult.has_infinite_lp);
    // console.log('Skipped order index:', liqResult.pass_order_id);
    // console.log('Number of orders needing force close:', liqResult.force_close_num);
    // console.log('Ideal SOL usage:', liqResult.ideal_lp_sol_amount.toString());
    // console.log('Actual SOL usage:', liqResult.real_lp_sol_amount.toString());
    // console.log('===============================\n');

    // Convert to BigInt for calculations
    const buyTokenAmountBig = BigInt(buyTokenAmount);
    const freeTokenAmount = BigInt(liqResult.free_lp_token_amount_sum);
    const realSolAmount = BigInt(liqResult.real_lp_sol_amount);
    const idealSolAmount = BigInt(liqResult.ideal_lp_sol_amount);

    // 1. Calculate completion percentage
    let completionPercentage;
    if (freeTokenAmount >= buyTokenAmountBig) {
      completionPercentage = "100.0";
    } else {
      const percentage = Math.floor((Number(freeTokenAmount) / Number(buyTokenAmountBig)) * 1000) / 10;
      completionPercentage = percentage.toFixed(1);
    }

    // 2. Calculate slippage percentage and get final SOL amount
    let slippagePercentage;
    let suggestedLiquidity;
    let finalRealSolAmount = realSolAmount;

    if (realSolAmount > 0n) {
      // Normal case: calculate slippage
      const diff = idealSolAmount > realSolAmount ? idealSolAmount - realSolAmount : realSolAmount - idealSolAmount;
      const slippage = Math.floor((Number(diff) / Number(idealSolAmount)) * 1000) / 10;
      slippagePercentage = slippage.toFixed(1);
    } else {
      // Special case: real SOL amount is 0, need to recalculate with suggested liquidity
      const suggestedAmount = (freeTokenAmount * BigInt(this.sdk.SUGGEST_LIQ_RATIO)) / 1000n;

      const recalcResult = calcLiqTokenBuy(
        price,
        suggestedAmount,
        orders,
        this.sdk.MAX_ORDERS_COUNT,
        passOrder,
        curveData.initialVirtualSol,
        curveData.initialVirtualToken
      );
      
      const recalcRealSol = BigInt(recalcResult.real_lp_sol_amount);
      const recalcIdealSol = BigInt(recalcResult.ideal_lp_sol_amount);
      
      if (recalcRealSol <= 0n) {
        throw new Error('Recalculated real SOL amount should be greater than 0');
      }
      
      finalRealSolAmount = recalcRealSol;
      
      const diff = recalcIdealSol > recalcRealSol ? recalcIdealSol - recalcRealSol : recalcRealSol - recalcIdealSol;
      const slippage = Math.floor((Number(diff) / Number(recalcIdealSol)) * 1000) / 10;
      slippagePercentage = slippage.toFixed(1);
    }

    // 3. Calculate suggested liquidity
    if (completionPercentage === "100.0") {
      suggestedLiquidity = buyTokenAmountBig.toString();
    } else {
      const suggested = (freeTokenAmount * BigInt(this.sdk.SUGGEST_LIQ_RATIO)) / 1000n;
      suggestedLiquidity = suggested.toString();
    }

    return {
      liqResult,
      completion: completionPercentage,
      slippage: slippagePercentage,
      suggestedTokenAmount: suggestedLiquidity,
      suggestedSolAmount: finalRealSolAmount.toString()
    };
  } catch (error) {
    console.error('calcLiqTokenBuy 调用失败:', error);
    throw error;
  }
}


/**
 * Simulate token sell transaction analysis
 * @param {string} mint - Token address
 * @param {bigint|string|number} sellTokenAmount - Token amount to sell (u64 format, precision 10^9)
 * @param {string} passOrder - Optional order address to skip (won't be liquidated)
 * @param {Object|null} lastPrice - Token price info, default null
 * @param {Object|null} ordersData - Orders response object, default null
 * @returns {Promise<Object>} Token sell simulation result with the following structure:
 *   - liqResult: {Object} Complete liquidity calculation result from calcLiqTokenSell, containing:
 *     - free_lp_sol_amount_sum: {bigint} Total available free liquidity SOL obtainable from selling
 *     - free_lp_token_amount_sum: {bigint} Maximum tokens sellable without force closing orders
 *     - lock_lp_sol_amount_sum: {bigint} Total locked liquidity SOL amount (excluding skipped orders)
 *     - lock_lp_token_amount_sum: {bigint} Total locked liquidity token amount (excluding skipped orders)
 *     - has_infinite_lp: {boolean} Whether includes infinite liquidity to minimum price
 *     - pass_order_id: {number} Index of skipped order in array (-1 if none skipped)
 *     - force_close_num: {number} Number of orders that need force closure for target sell amount
 *     - ideal_lp_sol_amount: {bigint} Theoretical maximum SOL obtainable at current price
 *     - real_lp_sol_amount: {bigint} Actual SOL obtainable considering real liquidity distribution
 *   - completion: {string} Sell completion percentage as decimal string (e.g., "85.2", "100.0")
 *   - slippage: {string} Price slippage percentage as decimal string (e.g., "2.5", "0.8")
 *   - suggestedTokenAmount: {string} Recommended token amount to sell based on available liquidity
 *   - suggestedSolAmount: {string} Expected SOL amount from suggested token sale
 */
async function simulateTokenSell(mint, sellTokenAmount, passOrder = null, lastPrice = null, ordersData = null, curveData = null) {
  // Get price and orders data
  let price = lastPrice;
  if (!price) {
    price = await this.sdk.data.price(mint);
  }

  //console.log("price=",price);

  let orders;
  if (!ordersData) {
    const ordersResponse = await this.sdk.data.orders(mint, {
      type: 'down_orders',
      limit: this.sdk.MAX_ORDERS_COUNT + 1
    });
    // Extract the actual orders array
    orders = ordersResponse.data.orders;
  } else {
    // If ordersData is provided, extract the orders array from the response object and limit its length
    orders = ordersData.data.orders.slice(0, this.sdk.MAX_ORDERS_COUNT + 1);
  }

  // Get dynamic liquidity pool parameters (supports external input to avoid duplicate requests)
  if (!curveData) {
    try {
      curveData = await this.sdk.chain.getCurveAccount(mint, { skipBalances: true });
    } catch (error) {
      throw new Error(`Failed to get curve account data: ${error.message}`);
    }
  }

  // console.log('Data obtained by simulateTokenSell:');
  // console.log('Price:', price);
  // console.log('Number of orders:', orders.length);
  // orders.forEach((order, i) => console.log(`Order ${i}: start=${order.lock_lp_start_price}, end=${order.lock_lp_end_price}, sol=${order.lock_lp_sol_amount}, token=${order.lock_lp_token_amount}`));

  // Call calcLiqTokenSell to perform liquidity calculation (passing dynamic liquidity pool parameters)
  try {
    const liqResult = calcLiqTokenSell(
      price,
      sellTokenAmount,
      orders,
      this.sdk.MAX_ORDERS_COUNT,
      passOrder,
      curveData.initialVirtualSol,
      curveData.initialVirtualToken
    );

    // console.log('\n=== calcLiqTokenSell return result ===');
    // console.log('Free liquidity SOL total:', liqResult.free_lp_sol_amount_sum.toString());
    // console.log('Free liquidity Token total:', liqResult.free_lp_token_amount_sum.toString());
    // console.log('Locked liquidity SOL total:', liqResult.lock_lp_sol_amount_sum.toString());
    // console.log('Locked liquidity Token total:', liqResult.lock_lp_token_amount_sum.toString());
    // console.log('Whether includes infinite liquidity:', liqResult.has_infinite_lp);
    // console.log('Skipped order index:', liqResult.pass_order_id);
    // console.log('Number of orders needing force close:', liqResult.force_close_num);
    // console.log('Ideal SOL obtained:', liqResult.ideal_lp_sol_amount.toString());
    // console.log('Actual SOL obtained:', liqResult.real_lp_sol_amount.toString());
    // console.log('===============================\n');

    // Convert to BigInt for calculations
    const sellTokenAmountBig = BigInt(sellTokenAmount);
    const freeTokenAmount = BigInt(liqResult.free_lp_token_amount_sum);
    const realSolAmount = BigInt(liqResult.real_lp_sol_amount);
    const idealSolAmount = BigInt(liqResult.ideal_lp_sol_amount);

    // 1. Calculate completion percentage
    let completionPercentage;
    if (freeTokenAmount >= sellTokenAmountBig) {
      completionPercentage = "100.0";
    } else {
      const percentage = Math.floor((Number(freeTokenAmount) / Number(sellTokenAmountBig)) * 1000) / 10;
      completionPercentage = percentage.toFixed(1);
    }

    // 2. Calculate slippage percentage and get final SOL amount
    let slippagePercentage;
    let suggestedLiquidity;
    let finalRealSolAmount = realSolAmount;

    if (realSolAmount > 0n) {
      // Normal case: calculate slippage
      const diff = idealSolAmount > realSolAmount ? idealSolAmount - realSolAmount : realSolAmount - idealSolAmount;
      const slippage = Math.floor((Number(diff) / Number(idealSolAmount)) * 1000) / 10;
      slippagePercentage = slippage.toFixed(1);
    } else {
      // Special case: real SOL amount is 0, need to recalculate with suggested liquidity
      const suggestedAmount = (freeTokenAmount * BigInt(this.sdk.SUGGEST_LIQ_RATIO)) / 1000n;
      
      const recalcResult = calcLiqTokenSell(
        price,
        suggestedAmount,
        orders,
        this.sdk.MAX_ORDERS_COUNT,
        passOrder,
        curveData.initialVirtualSol,
        curveData.initialVirtualToken
      );
      
      const recalcRealSol = BigInt(recalcResult.real_lp_sol_amount);
      const recalcIdealSol = BigInt(recalcResult.ideal_lp_sol_amount);
      
      if (recalcRealSol <= 0n) {
        throw new Error('Recalculated real SOL amount should be greater than 0');
      }
      
      finalRealSolAmount = recalcRealSol;
      
      const diff = recalcIdealSol > recalcRealSol ? recalcIdealSol - recalcRealSol : recalcRealSol - recalcIdealSol;
      const slippage = Math.floor((Number(diff) / Number(recalcIdealSol)) * 1000) / 10;
      slippagePercentage = slippage.toFixed(1);
    }

    // 3. Calculate suggested liquidity
    if (completionPercentage === "100.0") {
      suggestedLiquidity = sellTokenAmountBig.toString();
    } else {
      const suggested = (freeTokenAmount * BigInt(this.sdk.SUGGEST_LIQ_RATIO)) / 1000n;
      suggestedLiquidity = suggested.toString();
    }

    return {
      liqResult,
      completion: completionPercentage,
      slippage: slippagePercentage,
      suggestedTokenAmount: suggestedLiquidity,
      suggestedSolAmount: finalRealSolAmount.toString()
    };
  } catch (error) {
    console.error('calcLiqTokenSell 调用失败:', error.message);
    throw error;
  }
}



module.exports = {
    simulateTokenBuy,
    simulateTokenSell
};

