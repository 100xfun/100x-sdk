const CurveAMM = require('../utils/curve_amm');
const { simulateLongStopLoss, simulateShortStopLoss, simulateLongSolStopLoss, simulateShortSolStopLoss } = require('./simulator/long_shrot_stop');
const { simulateTokenBuy, simulateTokenSell } = require('./simulator/buy_sell_token');
const { simulateLongClose, simulateShortClose } = require('./simulator/close_indices');
const {calcLiqSolBuy,calcLiqSolSell } = require('./simulator/calc_sol_liq');



/**
 * Simulator Module Class
 */
class SimulatorModule { 
    constructor(sdk) {
        this.sdk = sdk;

        // Liquidity reservation ratio - how much liquidity to reserve relative to the last locked liquidity
        this.LIQUIDITY_RESERVATION = 100; // 100%;
        // Price adjustment percentage
        this.PRICE_ADJUSTMENT_PERCENTAGE = 0.5; // 0.5%
    }

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
    async simulateTokenBuy(mint, buyTokenAmount, passOrder = null, lastPrice = null, ordersData = null, curveData = null) {
        return simulateTokenBuy.call(this, mint, buyTokenAmount, passOrder, lastPrice, ordersData, curveData);
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
    async simulateTokenSell(mint, sellTokenAmount, passOrder = null, lastPrice = null, ordersData = null, curveData = null) {
        return simulateTokenSell.call(this, mint, sellTokenAmount, passOrder, lastPrice, ordersData, curveData);
    }

    /**
     * Simulate long position stop loss calculation
     * @param {string} mint - Token address
     * @param {bigint|string|number} buyTokenAmount - Token amount to buy for long position (u64 format, precision 10^9)
     * @param {bigint|string|number} stopLossPrice - User desired stop loss price (u128 format)
     * @param {Object|null} lastPrice - Token info, default null
     * @param {Object|null} ordersData - Orders data, default null
     * @returns {Promise<Object>} Stop loss analysis result
     */
    async simulateLongStopLoss(mint, buyTokenAmount, stopLossPrice, lastPrice = null, ordersData = null, borrowFee = null) {
        return simulateLongStopLoss.call(this, mint, buyTokenAmount, stopLossPrice, lastPrice, ordersData, borrowFee);
    }

    /**
     * Simulate short position stop loss calculation
     * @param {string} mint - Token address
     * @param {bigint|string|number} sellTokenAmount - Token amount to sell for short position (u64 format, precision 10^9)
     * @param {bigint|string|number} stopLossPrice - User desired stop loss price (u128 format)
     * @param {Object|null} lastPrice - Token info, default null
     * @param {Object|null} ordersData - Orders data, default null
     * @returns {Promise<Object>} Stop loss analysis result
     */
    async simulateShortStopLoss(mint, sellTokenAmount, stopLossPrice, lastPrice = null, ordersData = null, borrowFee = null) {
        return simulateShortStopLoss.call(this, mint, sellTokenAmount, stopLossPrice, lastPrice, ordersData, borrowFee);
    }

    /**
     * Simulate long position stop loss calculation with SOL amount input
     * @param {string} mint - Token address
     * @param {bigint|string|number} buySolAmount - SOL amount to spend for long position (u64 format, lamports)
     * @param {bigint|string|number} stopLossPrice - User desired stop loss price (u128 format)
     * @param {Object|null} lastPrice - Token info, default null
     * @param {Object|null} ordersData - Orders data, default null
     * @param {number} borrowFee - Borrow fee rate, default 2000 (2000/100000 = 0.02%)
     * @returns {Promise<Object>} Stop loss analysis result (same as simulateLongStopLoss)
     */
    async simulateLongSolStopLoss(mint, buySolAmount, stopLossPrice, lastPrice = null, ordersData = null, borrowFee = null, initialVirtualSol = null, initialVirtualToken = null, curveAccount = null) {
        return simulateLongSolStopLoss.call(this, mint, buySolAmount, stopLossPrice, lastPrice, ordersData, borrowFee, initialVirtualSol, initialVirtualToken, curveAccount);
    }

    /**
     * Simulate short position stop loss calculation with SOL amount input
     * @param {string} mint - Token address
     * @param {bigint|string|number} sellSolAmount - SOL amount needed for short position stop loss (u64 format, lamports)
     * @param {bigint|string|number} stopLossPrice - User desired stop loss price (u128 format)
     * @param {Object|null} lastPrice - Token info, default null
     * @param {Object|null} ordersData - Orders data, default null
     * @param {number} borrowFee - Borrow fee rate, default 2000 (2000/100000 = 0.02%)
     * @returns {Promise<Object>} Stop loss analysis result (same as simulateShortStopLoss)
     */
    async simulateShortSolStopLoss(mint, sellSolAmount, stopLossPrice, lastPrice = null, ordersData = null, borrowFee = null, initialVirtualSol = null, initialVirtualToken = null, curveAccount = null) {
        return simulateShortSolStopLoss.call(this, mint, sellSolAmount, stopLossPrice, lastPrice, ordersData, borrowFee, initialVirtualSol, initialVirtualToken, curveAccount);
    }

    /**
     * Generate candidate insertion indices for closing long position
     * @param {string} mint - Token address
     * @param {number|string|anchor.BN} closeOrderId - Order ID to close (order_id, not index)
     * @param {Object|null} ordersData - Orders data (optional)
     * @returns {Promise<Object>} Result containing closeOrderIndices array
     */
    async simulateLongClose(mint, closeOrderId, ordersData = null) {
        return simulateLongClose.call(this, mint, closeOrderId, ordersData);
    }

    /**
     * Generate candidate insertion indices for closing short position
     * @param {string} mint - Token address
     * @param {number|string|anchor.BN} closeOrderId - Order ID to close (order_id, not index)
     * @param {Object|null} ordersData - Orders data (optional)
     * @returns {Promise<Object>} Result containing closeOrderIndices array
     */
    async simulateShortClose(mint, closeOrderId, ordersData = null) {
        return simulateShortClose.call(this, mint, closeOrderId, ordersData);
    }

    /**
     * Simulate buy transaction with SOL amount input
     * @param {string} mint - Token address
     * @param {bigint|string|number} buySolAmount - SOL amount to spend (u64 format, lamports)
     * @returns {Promise<Object>} Buy simulation result with the following structure:
     *   - success: {boolean} Whether the simulation was successful
     *   - errorCode: {string|null} Error code if failed ('API_ERROR', 'DATA_ERROR', 'PARAM_ERROR')
     *   - errorMessage: {string|null} Error message if failed
     *   - data: {Object} Analysis result data containing:
     *     - inputType: {string} 'sol' - input type
     *     - inputAmount: {bigint} Input SOL amount
     *     - maxAllowedPrice: {bigint} Maximum allowed starting price (u128)
     *     - totalPriceSpan: {bigint} Total price range for the transaction (u128)
     *     - transactionCompletionRate: {number} Transaction completion rate (%)
     *     - idealTokenAmount: {bigint} Ideal token amount obtainable
     *     - idealSolAmount: {bigint} Ideal SOL amount needed
     *     - actualRequiredSolAmount: {bigint} Actual SOL amount required
     *     - actualObtainableTokenAmount: {bigint} Actual token amount obtainable
     *     - theoreticalSolAmount: {bigint} Theoretical SOL amount needed
     *     - minimumSlippagePercentage: {number} Minimum slippage percentage
     *     - totalLiquiditySolAmount: {bigint} Total available liquidity in SOL
     *     - totalLiquidityTokenAmount: {bigint} Total available liquidity in tokens
     */
    async simulateBuy(mint, buySolAmount) {
        try {
            // Parameter validation
            if (!mint || typeof mint !== 'string') {
                return {
                    success: false,
                    errorCode: 'PARAM_ERROR',
                    errorMessage: 'Invalid mint parameter: must be a non-empty string',
                    data: null
                };
            }

            // Convert buySolAmount to bigint
            let solAmountBigInt;
            try {
                solAmountBigInt = typeof buySolAmount === 'bigint' ? buySolAmount : BigInt(buySolAmount);
                if (solAmountBigInt <= 0n) {
                    throw new Error('Amount must be greater than 0');
                }
            } catch (error) {
                return {
                    success: false,
                    errorCode: 'PARAM_ERROR',
                    errorMessage: `Invalid buySolAmount parameter: ${error.message}`,
                    data: null
                };
            }

            // Get current price, orders data, and curve account in parallel
            const [priceResult, ordersResult, upOrdersResult, curveAccount] = await Promise.all([
                this.sdk.data.price(mint),
                this.sdk.data.orders(mint, { type: 'down_orders' }),
                this.sdk.data.orders(mint, { type: 'up_orders' }),
                this.sdk.chain.getCurveAccount(mint, { skipBalances: true })
            ]);

            if (!priceResult || !ordersResult) {
                return {
                    success: false,
                    errorCode: 'API_ERROR',
                    errorMessage: 'Failed to fetch price or orders data',
                    data: null
                };
            }

            // Use simulateTokenBuy to calculate (approximate token amount first)
            // This is a simplified implementation - you may need to iterate or use calcLiq directly
            const currentPrice = typeof priceResult === 'string' ? BigInt(priceResult) : BigInt(priceResult.last_price || priceResult);

            // Get curve account data for initialVirtualSol and initialVirtualToken
            const initialVirtualSol = curveAccount.initialVirtualSol;
            const initialVirtualToken = curveAccount.initialVirtualToken;

            const reSolBuy = calcLiqSolBuy(currentPrice, buySolAmount, upOrdersResult.data.orders, 50, null, initialVirtualSol, initialVirtualToken);

            //console.log("reSolBuy = ",reSolBuy)

            const estimatedTokenAmount = reSolBuy.tokenAmount;

            // Call simulateTokenBuy with estimated amount, pass curveAccount to avoid duplicate RPC
            const tokenBuyResult = await this.simulateTokenBuy(mint, estimatedTokenAmount, null, priceResult, ordersResult, curveAccount);

            // Transform result to match simulateBuy format
            return {
                success: true,
                errorCode: null,
                errorMessage: null,
                data: {
                    inputType: 'sol',
                    inputAmount: solAmountBigInt,
                    maxAllowedPrice: currentPrice,
                    totalPriceSpan: tokenBuyResult.liqResult?.total_price_span || 0n,
                    transactionCompletionRate: parseFloat(tokenBuyResult.completion || '0'),
                    idealTokenAmount: estimatedTokenAmount,
                    idealSolAmount: solAmountBigInt,
                    actualRequiredSolAmount: tokenBuyResult.liqResult?.real_lp_sol_amount || solAmountBigInt,
                    actualObtainableTokenAmount: tokenBuyResult.liqResult?.free_lp_token_amount_sum || 0n,
                    theoreticalSolAmount: tokenBuyResult.liqResult?.ideal_lp_sol_amount || solAmountBigInt,
                    minimumSlippagePercentage: parseFloat(tokenBuyResult.slippage || '0'),
                    totalLiquiditySolAmount: tokenBuyResult.liqResult?.free_lp_sol_amount_sum || 0n,
                    totalLiquidityTokenAmount: tokenBuyResult.liqResult?.free_lp_token_amount_sum || 0n
                }
            };

        } catch (error) {
            return {
                success: false,
                errorCode: 'DATA_ERROR',
                errorMessage: error.message || 'Unknown error occurred during buy simulation',
                data: null
            };
        }
    }

    /**
     * Simulate sell transaction with token amount input
     * @param {string} mint - Token address
     * @param {bigint|string|number} sellTokenAmount - Token amount to sell (u64 format, lamports)
     * @returns {Promise<Object>} Sell simulation result with the following structure:
     *   - success: {boolean} Whether the simulation was successful
     *   - errorCode: {string|null} Error code if failed ('API_ERROR', 'DATA_ERROR', 'PARAM_ERROR')
     *   - errorMessage: {string|null} Error message if failed
     *   - data: {Object} Analysis result data containing:
     *     - inputType: {string} 'token' - input type
     *     - inputAmount: {bigint} Input token amount
     *     - minAllowedPrice: {bigint} Minimum allowed starting price (u128)
     *     - totalPriceSpan: {bigint} Total price range for the transaction (u128)
     *     - transactionCompletionRate: {number} Transaction completion rate (%)
     *     - idealSolAmount: {bigint} Ideal SOL amount obtainable
     *     - idealTokenAmount: {bigint} Ideal token amount to sell
     *     - actualObtainedSolAmount: {bigint} Actual SOL amount obtainable
     *     - actualConsumedTokenAmount: {bigint} Actual token amount consumed
     *     - theoreticalSolAmount: {bigint} Theoretical SOL amount obtainable
     *     - minimumSlippagePercentage: {number} Minimum slippage percentage
     *     - totalLiquiditySolAmount: {bigint} Total available liquidity in SOL
     *     - totalLiquidityTokenAmount: {bigint} Total available liquidity in tokens
     */
    async simulateSell(mint, sellTokenAmount) {
        try {
            // Parameter validation
            if (!mint || typeof mint !== 'string') {
                return {
                    success: false,
                    errorCode: 'PARAM_ERROR',
                    errorMessage: 'Invalid mint parameter: must be a non-empty string',
                    data: null
                };
            }

            // Convert sellTokenAmount to bigint
            let tokenAmountBigInt;
            try {
                tokenAmountBigInt = typeof sellTokenAmount === 'bigint' ? sellTokenAmount : BigInt(sellTokenAmount);
                if (tokenAmountBigInt <= 0n) {
                    throw new Error('Amount must be greater than 0');
                }
            } catch (error) {
                return {
                    success: false,
                    errorCode: 'PARAM_ERROR',
                    errorMessage: `Invalid sellTokenAmount parameter: ${error.message}`,
                    data: null
                };
            }

            // Get current price and orders data in parallel
            // For sell transactions, we need down_orders (long orders that provide buy liquidity)
            const [priceResult, ordersResult] = await Promise.all([
                this.sdk.data.price(mint),
                this.sdk.data.orders(mint, { type: 'down_orders' })
            ]);

            if (!priceResult || !ordersResult) {
                return {
                    success: false,
                    errorCode: 'API_ERROR',
                    errorMessage: 'Failed to fetch price or orders data',
                    data: null
                };
            }

            const currentPrice = typeof priceResult === 'string' ? BigInt(priceResult) : BigInt(priceResult.last_price || priceResult);

            // Call simulateTokenSell
            const tokenSellResult = await this.simulateTokenSell(mint, tokenAmountBigInt, null, priceResult, ordersResult);

            // Estimate ideal SOL amount
            const priceDecimal = CurveAMM.u128ToDecimal(currentPrice);
            const tokenInDecimal = Number(tokenAmountBigInt) / 1e9; // Convert token lamports to tokens (9-digit precision)
            const estimatedSolAmount = BigInt(Math.floor((tokenInDecimal * priceDecimal) * 1e9)); // Convert to SOL lamports

            // Transform result to match simulateSell format
            return {
                success: true,
                errorCode: null,
                errorMessage: null,
                data: {
                    inputType: 'token',
                    inputAmount: tokenAmountBigInt,
                    minAllowedPrice: currentPrice,
                    totalPriceSpan: tokenSellResult.liqResult?.total_price_span || 0n,
                    transactionCompletionRate: parseFloat(tokenSellResult.completion || '0'),
                    idealSolAmount: estimatedSolAmount,
                    idealTokenAmount: tokenAmountBigInt,
                    actualObtainedSolAmount: tokenSellResult.liqResult?.real_lp_sol_amount || 0n,
                    actualConsumedTokenAmount: tokenAmountBigInt,
                    theoreticalSolAmount: tokenSellResult.liqResult?.ideal_lp_sol_amount || estimatedSolAmount,
                    minimumSlippagePercentage: parseFloat(tokenSellResult.slippage || '0'),
                    totalLiquiditySolAmount: tokenSellResult.liqResult?.free_lp_sol_amount_sum || 0n,
                    totalLiquidityTokenAmount: tokenSellResult.liqResult?.free_lp_token_amount_sum || 0n
                }
            };

        } catch (error) {
            return {
                success: false,
                errorCode: 'DATA_ERROR',
                errorMessage: error.message || 'Unknown error occurred during sell simulation',
                data: null
            };
        }
    }


}

module.exports = SimulatorModule;
