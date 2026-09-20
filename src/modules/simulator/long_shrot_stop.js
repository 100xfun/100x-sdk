
const Decimal = require('decimal.js');
const CurveAMM = require('../../utils/curve_amm');
const {transformOrdersData , checkPriceRangeOverlap} = require('./stop_loss_utils')
const { PRICE_ADJUSTMENT_PERCENTAGE, MIN_STOP_LOSS_PERCENT } = require('./utils');
const JSONbig = require('json-bigint')({ storeAsString: false });

/**
 * Simulate long position stop loss calculation
 *
 * Simulates the stop loss calculation for a long position, returning the executable stop loss price and related parameters.
 * This function automatically adjusts the stop loss price to avoid overlapping with the price ranges of existing orders,
 * and returns the insertion position index array required for contract execution.
 *
 * @param {string} mint - Token address
 * @param {bigint|string|number} buyTokenAmount - Token amount to buy for long position (u64 format, precision 10^9)
 * @param {bigint|string|number} stopLossPrice - User desired stop loss price (u128 format)
 * @param {Object|null} lastPrice - Token info, default null (auto-fetched if null)
 * @param {Object|null} ordersData - Orders data, default null (auto-fetched if null)
 * @param {number} borrowFee - Borrow fee rate, default 2000 (2000/100000 = 0.02%)
 *
 * @returns {Promise<Object>} Stop loss analysis result
 * @returns {bigint} returns.executableStopLossPrice - Calculated executable stop loss price (u128 format)
 *   - This is the stop loss price adjusted to not overlap with existing orders
 *   - May be lower than the user-provided stopLossPrice (to avoid overlap)
 *   - Can be used directly as the closePrice parameter of sdk.trading.long()
 *
 * @returns {bigint} returns.tradeAmount - Estimated SOL amount obtained from selling at stop loss (lamports)
 *   - This is the SOL obtained from selling buyTokenAmount tokens at the executableStopLossPrice
 *   - Does not include fee deduction
 *   - Used to estimate the proceeds at stop loss
 *
 * @returns {number} returns.stopLossPercentage - Stop loss percentage (relative to current price)
 *   - Formula: ((currentPrice - executableStopLossPrice) / currentPrice) * 100
 *   - For example: 3.5 means the stop loss price is 3.5% lower than the current price
 *   - For a long position this value should be positive (stop loss price below current price)
 *
 * @returns {number} returns.leverage - Leverage ratio
 *   - Formula: currentPrice / (currentPrice - executableStopLossPrice)
 *   - For example: 28.57 means about 28.57x leverage
 *   - The higher the leverage, the higher the risk, but also the higher the potential return
 *
 * @returns {bigint} returns.currentPrice - Current price (u128 format)
 *   - The current token price used in the calculation
 *   - Used for reference and validation
 *
 * @returns {number} returns.iterations - Number of price adjustment iterations
 *   - The number of times the function automatically adjusted the stop loss price to avoid price range overlap
 *   - Each adjustment lowers the price by PRICE_ADJUSTMENT_PERCENTAGE (default 0.5%)
 *   - If the iteration count is too high, you may need to reselect the stop loss price
 *
 * @returns {bigint} returns.originalStopLossPrice - User-provided original stop loss price (u128 format)
 *   - Used to compare the price difference before and after adjustment
 *   - If executableStopLossPrice differs greatly from this, it indicates existing orders are dense
 *
 * @returns {number[]} returns.close_insert_indices - Candidate index array for the closing order insertion position ⭐ New
 *   - The array contains the OrderBook index values of multiple candidate insertion positions
 *   - Structure: [main position index, 1st before, 1st after, 2nd before, 2nd after, 3rd before, 3rd after]
 *   - For example: [25, 10, 33, 5, 40, 2, 50] means the main position is index 25, with alternative positions including indices 10, 33, etc.
 *   - Contains up to 7 index values (1 main position + 3 before + 3 after)
 *   - If the orderbook is empty, returns [65535] (u16::MAX, meaning insert at the head)
 *   - Usage: passed as the closeInsertIndices parameter of sdk.trading.long()
 *   - Improves success rate: even if the order at the main position is deleted, the contract can try other candidate positions
 *
 * @returns {bigint} returns.estimatedMargin - Estimated required margin (SOL lamports)
 *   - Formula: buy cost - close proceeds (after fee deduction)
 *   - This is the minimum margin required to execute this stop loss strategy
 *   - Can be used as the marginSolMax parameter of sdk.trading.long()
 *   - When actually calling, it is recommended to add a 10-20% buffer to handle price fluctuations
 *
 * @throws {Error} When required parameters are missing
 * @throws {Error} When price or orders data cannot be fetched
 * @throws {Error} When a suitable stop loss price cannot be found after reaching the maximum iterations
 * @throws {Error} When the price becomes negative after adjustment
 *
 * @example
 * // Basic usage: long 1 token, stop loss price at 97% of the current price
 * const result = await sdk.simulator.simulateLongStopLoss(
 *   '4Kq51Kt48FCwdo5CeKjRVPodH1ticHa7mZ5n5gqMEy1X',  // mint
 *   1000000000n,                                       // 1 token (precision 10^9)
 *   BigInt('97000000000000000000')                     // stop loss price
 * );
 *
 * console.log(`Executable stop loss price: ${result.executableStopLossPrice}`);
 * console.log(`Stop loss percentage: ${result.stopLossPercentage}%`);
 * console.log(`Leverage: ${result.leverage}x`);
 * console.log(`Estimated margin: ${result.estimatedMargin} lamports`);
 * console.log(`Insert position indices: ${result.close_insert_indices}`);
 *
 * @example
 * // Full workflow: simulate then execute a long trade
 * async function openLongPosition(sdk, mint, buyTokenAmount, stopLossPrice) {
 *   // 1. Simulate stop loss calculation
 *   const simulation = await sdk.simulator.simulateLongStopLoss(
 *     mint,
 *     buyTokenAmount,
 *     stopLossPrice
 *   );
 *
 *   // 2. Check whether the stop loss price was significantly adjusted
 *   const priceDiff = Number((simulation.originalStopLossPrice - simulation.executableStopLossPrice) * 10000n / simulation.originalStopLossPrice) / 100;
 *   if (priceDiff > 1.0) {
 *     console.warn(`Stop loss price was adjusted by ${priceDiff}%, existing orders are dense`);
 *   }
 *
 *   // 3. Prepare transaction parameters
 *   const maxSolAmount = simulation.estimatedMargin * 120n / 100n; // add 20% buffer
 *   const marginSolMax = simulation.estimatedMargin * 115n / 100n; // add 15% buffer
 *
 *   // 4. Execute the long trade
 *   const tx = await sdk.trading.long({
 *     mint: mint,
 *     buyTokenAmount: buyTokenAmount,
 *     maxSolAmount: maxSolAmount,
 *     marginSolMax: marginSolMax,
 *     closePrice: simulation.executableStopLossPrice,
 *     closeInsertIndices: simulation.close_insert_indices  // ⭐ use the new index array
 *   });
 *
 *   return tx;
 * }
 *
 * @see {@link simulateShortStopLoss} Stop loss calculation for short positions
 * @see {@link simulateLongSolStopLoss} SOL-amount-based stop loss calculation for long positions
 * @since 2.0.0
 * @version 2.0.0 - Changed from returning prev_order_pda/next_order_pda to returning close_insert_indices
 */
async function simulateLongStopLoss(mint, buyTokenAmount, stopLossPrice, lastPrice = null, ordersData = null, borrowFee = null, initialVirtualSol = null, initialVirtualToken = null) {
    try {
        // Parameter validation
        if (!mint || !buyTokenAmount || !stopLossPrice) {
            throw new Error('Missing required parameters');
        }

        // If borrowFee or pool parameters are not provided, fetch them from the chain in a single call
        if (borrowFee === null || initialVirtualSol === null || initialVirtualToken === null) {
            const curveAccount = await this.sdk.chain.getCurveAccount(mint, { skipBalances: true });
            if (borrowFee === null) borrowFee = curveAccount.borrowFee;
            // The chain returns u64 raw units (lamports/smallest unit), which need to be divided by 10^9 to convert to human-readable units
            // Consistent with the conversion method in calcLiq.js
            if (initialVirtualSol === null) initialVirtualSol = new Decimal(curveAccount.initialVirtualSol.toString()).div(CurveAMM.SOL_PRECISION_FACTOR_DECIMAL).toString();
            if (initialVirtualToken === null) initialVirtualToken = new Decimal(curveAccount.initialVirtualToken.toString()).div(CurveAMM.TOKEN_PRECISION_FACTOR_DECIMAL).toString();
        }

        // Get current price
        if (!lastPrice) {
            //console.log('Getting current price...');
            lastPrice = await this.sdk.data.price(mint);
            if (!lastPrice) {
                throw new Error('Failed to get current price');
            }
        }
        //console.log("simulateLongStopLoss lastPrice=",lastPrice)

        // Get ordersData
        if (!ordersData) {
            //console.log('Getting orders data...');
            ordersData = await this.sdk.data.orders(mint, { type: 'down_orders' });
            if (!ordersData || !ordersData.success) {
                throw new Error('Failed to get orders data');
            }
        }

        //console.log("ordersData=", JSONbig.stringify(ordersData, null, 2))
        //console.log("ordersData len=", ordersData.data.orders.length)

        // Calculate current price
        let currentPrice;
        if (lastPrice === null || lastPrice === undefined || lastPrice === '0') {
            //console.log('Current price is empty, using initial price');
            currentPrice = CurveAMM.getInitialPrice();
        } else {
            currentPrice = BigInt(lastPrice);
            if (!currentPrice || currentPrice === 0n) {
                //console.log('Current price is 0, using initial price');
                currentPrice = CurveAMM.getInitialPrice();
            }
        }


        // Transform orders data
        const downOrders = transformOrdersData(ordersData);
        //console.log(`downOrders Found ${downOrders.length} existing long orders`);
        //console.log("downOrders downOrders=",downOrders)

        // Initialize stop loss prices
        let stopLossStartPrice = BigInt(stopLossPrice);
        let stopLossEndPrice;
        let maxIterations = 1000; // Prevent infinite loop
        let iteration = 0;
        let finalOverlapResult = null; // Record final overlap result
        let finalTradeAmount = 0n; // Record final trade amount

        // Check and adjust the stop loss price to meet the minimum distance requirement (long: stop loss price must be below current price by at least MIN_STOP_LOSS_PERCENT)
        // Check and adjust stop loss price to meet minimum distance requirement (long: stop loss must be below current price by at least MIN_STOP_LOSS_PERCENT)
        const minAllowedStopLoss = currentPrice - (currentPrice * BigInt(MIN_STOP_LOSS_PERCENT)) / 1000n;
        if (stopLossStartPrice > minAllowedStopLoss) {
            const originalStopLoss = stopLossStartPrice;
            stopLossStartPrice = minAllowedStopLoss;
            const originalPercent = Number((currentPrice - originalStopLoss) * 1000n / currentPrice) / 10;
            const adjustedPercent = Number((currentPrice - stopLossStartPrice) * 1000n / currentPrice) / 10;
            console.log(`止损价格自动调整以满足最小距离要求:`);
            console.log(`  原始止损距离: ${originalPercent.toFixed(2)}%`);
            console.log(`  调整后距离: ${adjustedPercent.toFixed(2)}% (最小要求: ${Number(MIN_STOP_LOSS_PERCENT) / 10}%)`);
            console.log(`  原始止损价: ${originalStopLoss}`);
            console.log(`  调整后止损价: ${stopLossStartPrice}`);
        }

        //console.log(`Start price: ${stopLossStartPrice}, Target token amount: ${buyTokenAmount}`);

        // Loop to adjust stop loss price until no overlap
        while (iteration < maxIterations) {
            iteration++;

            // // Calculate stop loss end price
            // console.log(`[Long Stop Loss Debug] Iteration ${iteration}:`);
            // console.log(`  - stopLossStartPrice: ${stopLossStartPrice.toString()}`);
            // console.log(`  - buyTokenAmount: ${buyTokenAmount.toString()}`);
            // console.log(`  - Calling CurveAMM.sellFromPriceWithTokenInput...`);

            const tradeResult = CurveAMM.sellFromPriceWithTokenInputWithParams(stopLossStartPrice, buyTokenAmount, initialVirtualSol, initialVirtualToken);

            //console.log(`  - tradeResult:`, tradeResult);

            if (!tradeResult) {
                console.error(`[Long Stop Loss Error] Failed at iteration ${iteration}`);
                console.error(`  - stopLossStartPrice: ${stopLossStartPrice.toString()}`);
                console.error(`  - buyTokenAmount: ${buyTokenAmount.toString()}`);
                throw new Error('Failed to calculate stop loss end price');
            }

            stopLossEndPrice = tradeResult[0]; // Price after trade completion
            const tradeAmount = tradeResult[1]; // SOL output amount

            // console.log(`  - stopLossEndPrice: ${stopLossEndPrice.toString()}`);
            // console.log(`  - tradeAmount: ${tradeAmount.toString()}`);

            //console.log(`Iteration ${iteration}: startPrice=${stopLossStartPrice}, endPrice=${stopLossEndPrice}, SOL output=${tradeAmount} / Iteration ${iteration}: Start=${stopLossStartPrice}, End=${stopLossEndPrice}, SOL output=${tradeAmount}`);

            // Check price range overlap
            const overlapResult = checkPriceRangeOverlap('down_orders', downOrders, stopLossStartPrice, stopLossEndPrice);

            if (overlapResult.no_overlap) {
                //console.log('No price range overlap, can execute / No price range overlap, can execute');
                finalOverlapResult = overlapResult; // Record final overlap result
                finalTradeAmount = tradeAmount; // Record final trade amount
                break;
            }

            //console.log(`Found overlap: ${overlapResult.overlap_reason} / Found overlap: ${overlapResult.overlap_reason}`);

            // Adjust start price (decrease by 0.5%)
            // Using approach 2: directly compute 0.5% = 5/1000
            const adjustmentAmount = (stopLossStartPrice * BigInt(PRICE_ADJUSTMENT_PERCENTAGE)) / 1000n;
            stopLossStartPrice = stopLossStartPrice - adjustmentAmount;

            //console.log(`Adjusted start price: ${stopLossStartPrice} / Adjusted start price: ${stopLossStartPrice}`);

            // Safety check: ensure the price does not become negative
            if (stopLossStartPrice <= 0n) {
                throw new Error('止损价格调整后变为负数，无法继续 / Stop loss price became negative after adjustment');
            }
        }

        if (iteration >= maxIterations) {
            throw new Error('达到最大迭代次数，无法找到合适的止损价格 / Reached maximum iterations, cannot find suitable stop loss price');
        }

        // Calculate final return values
        const executableStopLossPrice = stopLossStartPrice;

        // Calculate stop loss percentage
        let stopLossPercentage = 0;
        let leverage = 1;

        if (currentPrice !== executableStopLossPrice) {
            stopLossPercentage = Number((BigInt(10000) * (currentPrice - executableStopLossPrice)) / currentPrice) / 100;
            leverage = Number((BigInt(10000) * currentPrice) / (currentPrice - executableStopLossPrice)) / 10000;
        }

        // Calculate margin requirement
        let estimatedMargin = 0n;
        try {
            // 1. Calculate the SOL required to buy from the current price
            const buyResult = CurveAMM.buyFromPriceWithTokenOutputWithParams(currentPrice, buyTokenAmount, initialVirtualSol, initialVirtualToken);
            if (buyResult) {
                const requiredSol = buyResult[1]; // SOL input amount

                // 2. Calculate the proceeds at close after deducting the fee
                const closeOutputSolAfterFee = CurveAMM.calculateAmountAfterFee(finalTradeAmount, borrowFee);

                // 3. Calculate margin = buy cost - close proceeds (after fee deduction)
                if (closeOutputSolAfterFee !== null && requiredSol > closeOutputSolAfterFee) {
                    estimatedMargin = requiredSol - closeOutputSolAfterFee;
                }
            }
        } catch (marginError) {
            console.warn('Failed to calculate estimated margin:', marginError.message);
            // Keep estimatedMargin as 0n
        }

        // console.log(`Calculation completed:`);
        // console.log(`  Executable stop loss price: ${executableStopLossPrice}`);
        // console.log(`  SOL output amount: ${finalTradeAmount}`);
        // console.log(`  Stop loss percentage: ${stopLossPercentage}%`);
        // console.log(`  Leverage: ${leverage}x`);
        // console.log(`  Close insert indices: ${finalOverlapResult.close_insert_indices}`);

        return {
            executableStopLossPrice: executableStopLossPrice, // Calculated reasonable stop loss value
            tradeAmount: finalTradeAmount, // SOL output amount
            stopLossPercentage: stopLossPercentage, // Stop loss percentage relative to current price
            leverage: leverage, // Leverage ratio
            currentPrice: currentPrice, // Current price
            iterations: iteration, // Number of adjustments
            originalStopLossPrice: BigInt(stopLossPrice), // Original stop loss price
            close_insert_indices: finalOverlapResult.close_insert_indices, // Candidate insertion indices for closing order
            estimatedMargin: estimatedMargin // Estimated margin requirement in SOL (lamports)
        };

    } catch (error) {
        console.error('Failed to simulate stop loss calculation:', error.message);
        throw error;
    }
}


/**
 * Simulate short position stop loss calculation
 *
 * Simulates the stop loss calculation for a short position, returning the executable stop loss price and related parameters.
 * This function automatically adjusts the stop loss price to avoid overlapping with the price ranges of existing orders,
 * and returns the insertion position index array required for contract execution.
 *
 * @param {string} mint - Token address
 * @param {bigint|string|number} sellTokenAmount - Token amount to sell for short position (u64 format, precision 10^9)
 * @param {bigint|string|number} stopLossPrice - User desired stop loss price (u128 format)
 * @param {Object|null} lastPrice - Token info, default null (auto-fetched if null)
 * @param {Object|null} ordersData - Orders data, default null (auto-fetched if null)
 * @param {number} borrowFee - Borrow fee rate, default 2000 (2000/100000 = 0.02%)
 *
 * @returns {Promise<Object>} Stop loss analysis result
 * @returns {bigint} returns.executableStopLossPrice - Calculated executable stop loss price (u128 format)
 *   - This is the stop loss price adjusted to not overlap with existing orders
 *   - May be higher than the user-provided stopLossPrice (to avoid overlap)
 *   - Can be used directly as the closePrice parameter of sdk.trading.short()
 *
 * @returns {bigint} returns.tradeAmount - Estimated SOL amount needed to buy back at stop loss (lamports)
 *   - This is the SOL needed to buy back sellTokenAmount tokens at the executableStopLossPrice
 *   - Does not include fees
 *   - Used to estimate the cost at stop loss
 *
 * @returns {number} returns.stopLossPercentage - Stop loss percentage (relative to current price)
 *   - Formula: ((executableStopLossPrice - currentPrice) / currentPrice) * 100
 *   - For example: 3.5 means the stop loss price is 3.5% higher than the current price
 *   - For a short position this value should be positive (stop loss price above current price)
 *
 * @returns {number} returns.leverage - Leverage ratio
 *   - Formula: currentPrice / (executableStopLossPrice - currentPrice)
 *   - For example: 28.57 means about 28.57x leverage
 *   - The higher the leverage, the higher the risk, but also the higher the potential return
 *
 * @returns {bigint} returns.currentPrice - Current price (u128 format)
 *   - The current token price used in the calculation
 *   - Used for reference and validation
 *
 * @returns {number} returns.iterations - Number of price adjustment iterations
 *   - The number of times the function automatically adjusted the stop loss price to avoid price range overlap
 *   - Each adjustment raises the price by PRICE_ADJUSTMENT_PERCENTAGE (default 0.5%)
 *   - If the iteration count is too high, you may need to reselect the stop loss price
 *
 * @returns {bigint} returns.originalStopLossPrice - User-provided original stop loss price (u128 format)
 *   - Used to compare the price difference before and after adjustment
 *   - If executableStopLossPrice differs greatly from this, it indicates existing orders are dense
 *
 * @returns {number[]} returns.close_insert_indices - Candidate index array for the closing order insertion position ⭐ New
 *   - The array contains the OrderBook index values of multiple candidate insertion positions
 *   - Structure: [main position index, 1st before, 1st after, 2nd before, 2nd after, 3rd before, 3rd after]
 *   - For example: [25, 10, 33, 5, 40, 2, 50] means the main position is index 25, with alternative positions including indices 10, 33, etc.
 *   - Contains up to 7 index values (1 main position + 3 before + 3 after)
 *   - If the orderbook is empty, returns [65535] (u16::MAX, meaning insert at the head)
 *   - Usage: passed as the closeInsertIndices parameter of sdk.trading.short()
 *   - Improves success rate: even if the order at the main position is deleted, the contract can try other candidate positions
 *
 * @returns {bigint} returns.estimatedMargin - Estimated required margin (SOL lamports)
 *   - Formula: close cost (including fee) - open proceeds - open fee
 *   - This is the minimum margin required to execute this stop loss strategy
 *   - Can be used as the marginSolMax parameter of sdk.trading.short()
 *   - When actually calling, it is recommended to add a 10-20% buffer to handle price fluctuations
 *
 * @throws {Error} When required parameters are missing
 * @throws {Error} When price or orders data cannot be fetched
 * @throws {Error} When a suitable stop loss price cannot be found after reaching the maximum iterations
 * @throws {Error} When the price exceeds the maximum value after adjustment
 *
 * @example
 * // Basic usage: short 1 token, stop loss price at 103% of the current price
 * const result = await sdk.simulator.simulateShortStopLoss(
 *   '4Kq51Kt48FCwdo5CeKjRVPodH1ticHa7mZ5n5gqMEy1X',  // mint
 *   1000000000n,                                       // 1 token (precision 10^9)
 *   BigInt('103000000000000000000')                    // stop loss price
 * );
 *
 * console.log(`Executable stop loss price: ${result.executableStopLossPrice}`);
 * console.log(`Stop loss percentage: ${result.stopLossPercentage}%`);
 * console.log(`Leverage: ${result.leverage}x`);
 * console.log(`Estimated margin: ${result.estimatedMargin} lamports`);
 * console.log(`Insert position indices: ${result.close_insert_indices}`);
 *
 * @example
 * // Full workflow: simulate then execute a short trade
 * async function openShortPosition(sdk, mint, sellTokenAmount, stopLossPrice) {
 *   // 1. Simulate stop loss calculation
 *   const simulation = await sdk.simulator.simulateShortStopLoss(
 *     mint,
 *     sellTokenAmount,
 *     stopLossPrice
 *   );
 *
 *   // 2. Check whether the stop loss price was significantly adjusted
 *   const priceDiff = Number((simulation.executableStopLossPrice - simulation.originalStopLossPrice) * 10000n / simulation.originalStopLossPrice) / 100;
 *   if (priceDiff > 1.0) {
 *     console.warn(`Stop loss price was adjusted by ${priceDiff}%, existing orders are dense`);
 *   }
 *
 *   // 3. Prepare transaction parameters
 *   const minSolOutput = simulation.tradeAmount * 80n / 100n; // obtain at least 80%
 *   const marginSolMax = simulation.estimatedMargin * 115n / 100n; // add 15% buffer
 *
 *   // 4. Execute the short trade
 *   const tx = await sdk.trading.short({
 *     mint: mint,
 *     borrowSellTokenAmount: sellTokenAmount,
 *     minSolOutput: minSolOutput,
 *     marginSolMax: marginSolMax,
 *     closePrice: simulation.executableStopLossPrice,
 *     closeInsertIndices: simulation.close_insert_indices  // ⭐ use the new index array
 *   });
 *
 *   return tx;
 * }
 *
 * @see {@link simulateLongStopLoss} Stop loss calculation for long positions
 * @see {@link simulateShortSolStopLoss} SOL-amount-based stop loss calculation for short positions
 * @since 2.0.0
 * @version 2.0.0 - Changed from returning prev_order_pda/next_order_pda to returning close_insert_indices
 */
async function simulateShortStopLoss(mint, sellTokenAmount, stopLossPrice, lastPrice = null, ordersData = null, borrowFee = null, initialVirtualSol = null, initialVirtualToken = null) {
    try {
        // Parameter validation
        if (!mint || !sellTokenAmount || !stopLossPrice) {
            throw new Error('Missing required parameters');
        }

        // If borrowFee or pool parameters are not provided, fetch them from the chain in a single call
        if (borrowFee === null || initialVirtualSol === null || initialVirtualToken === null) {
            const curveAccount = await this.sdk.chain.getCurveAccount(mint, { skipBalances: true });
            if (borrowFee === null) borrowFee = curveAccount.borrowFee;
            // The chain returns u64 raw units (lamports/smallest unit), which need to be divided by 10^9 to convert to human-readable units
            // Consistent with the conversion method in calcLiq.js
            if (initialVirtualSol === null) initialVirtualSol = new Decimal(curveAccount.initialVirtualSol.toString()).div(CurveAMM.SOL_PRECISION_FACTOR_DECIMAL).toString();
            if (initialVirtualToken === null) initialVirtualToken = new Decimal(curveAccount.initialVirtualToken.toString()).div(CurveAMM.TOKEN_PRECISION_FACTOR_DECIMAL).toString();
        }

        // Get current price
        if (!lastPrice) {
            //console.log('Getting current price...');
            lastPrice = await this.sdk.data.price(mint);
            if (!lastPrice) {
                throw new Error('Failed to get current price');
            }
        }

        // Get ordersData
        if (!ordersData) {
            //console.log('Getting orders data...');
            ordersData = await this.sdk.data.orders(mint, { type: 'up_orders' });
            if (!ordersData || !ordersData.success) {
                throw new Error('Failed to get orders data');
            }
        }

        //console.log("ordersData=", JSONbig.stringify(ordersData, null, 2))
        //console.log("ordersData len=", ordersData.data.orders.length)

        // Calculate current price
        let currentPrice;
        if (lastPrice === null || lastPrice === undefined || lastPrice === '0') {
            //console.log('Current price is empty, using initial price');
            currentPrice = CurveAMM.getInitialPrice();
        } else {
            currentPrice = BigInt(lastPrice);
            if (!currentPrice || currentPrice === 0n) {
                //console.log('Current price is 0, using initial price');
                currentPrice = CurveAMM.getInitialPrice();
            }
        }

        // Transform orders data
        const upOrders = transformOrdersData(ordersData);
        //console.log(`upOrders Found ${upOrders.length} existing short orders`);

        // Initialize stop loss prices
        let stopLossStartPrice = BigInt(stopLossPrice);
        let stopLossEndPrice;
        let maxIterations = 1000; // Prevent infinite loop
        let iteration = 0;
        let finalOverlapResult = null; // Record final overlap result
        let finalTradeAmount = 0n; // Record final trade amount

        // Check and adjust the stop loss price to meet the minimum distance requirement (short: stop loss price must be above current price by at least MIN_STOP_LOSS_PERCENT)
        // Check and adjust stop loss price to meet minimum distance requirement (short: stop loss must be above current price by at least MIN_STOP_LOSS_PERCENT)
        const minAllowedStopLoss = currentPrice + (currentPrice * BigInt(MIN_STOP_LOSS_PERCENT)) / 1000n;
        if (stopLossStartPrice < minAllowedStopLoss) {
            const originalStopLoss = stopLossStartPrice;
            stopLossStartPrice = minAllowedStopLoss;
            const originalPercent = Number((originalStopLoss - currentPrice) * 1000n / currentPrice) / 10;
            const adjustedPercent = Number((stopLossStartPrice - currentPrice) * 1000n / currentPrice) / 10;

        }

        //console.log(`Start price: ${stopLossStartPrice}, Target token amount: ${sellTokenAmount}`);

        // Loop to adjust stop loss price until no overlap
        while (iteration < maxIterations) {
            iteration++;

            // // Calculate stop loss end price
            // console.log(`[Sell Stop Loss Debug] Iteration ${iteration}:`);
            // console.log(`  - stopLossStartPrice: ${stopLossStartPrice.toString()}`);
            // console.log(`  - sellTokenAmount: ${sellTokenAmount.toString()}`);
            // console.log(`  - Calling CurveAMM.buyFromPriceWithTokenOutput...`);

            const tradeResult = CurveAMM.buyFromPriceWithTokenOutputWithParams(stopLossStartPrice, sellTokenAmount, initialVirtualSol, initialVirtualToken);

            //console.log(`  - tradeResult:`, tradeResult);

            if (!tradeResult) {
                console.error(`[Sell Stop Loss Error] Failed at iteration ${iteration}`);
                console.error(`  - stopLossStartPrice: ${stopLossStartPrice.toString()}`);
                console.error(`  - sellTokenAmount: ${sellTokenAmount.toString()}`);
                throw new Error('Failed to calculate stop loss end price');
            }

            stopLossEndPrice = tradeResult[0]; // Price after trade completion
            const tradeAmount = tradeResult[1]; // SOL input amount

            // console.log(`  - stopLossEndPrice: ${stopLossEndPrice.toString()}`);
            // console.log(`  - tradeAmount: ${tradeAmount.toString()}`);

            //console.log(`Iteration ${iteration}: startPrice=${stopLossStartPrice}, endPrice=${stopLossEndPrice}, SOL input=${tradeAmount} / Iteration ${iteration}: Start=${stopLossStartPrice}, End=${stopLossEndPrice}, SOL input=${tradeAmount}`);

            // Check price range overlap
            const overlapResult = checkPriceRangeOverlap('up_orders', upOrders, stopLossStartPrice, stopLossEndPrice);

            if (overlapResult.no_overlap) {
                //console.log(' / No price range overlap, can execute');
                finalOverlapResult = overlapResult; // Record final overlap result
                finalTradeAmount = tradeAmount; // Record final trade amount
                break;
            }

            //console.log(`Found overlap: ${overlapResult.overlap_reason} / Found overlap: ${overlapResult.overlap_reason}`);

            // Adjust start price (increase by 0.5%)
            // Using approach 2: directly compute 0.5% = 5/1000
            const adjustmentAmount = (stopLossStartPrice * BigInt(PRICE_ADJUSTMENT_PERCENTAGE)) / 1000n;
            stopLossStartPrice = stopLossStartPrice + adjustmentAmount;

            //console.log(`Adjusted start price: ${stopLossStartPrice} / Adjusted start price: ${stopLossStartPrice}`);

            // Safety check: ensure the price does not exceed the maximum
            if (stopLossStartPrice >= CurveAMM.MAX_U128_PRICE) {
                throw new Error(`Stop loss price exceeded maximum after adjustment: ${stopLossStartPrice} >= ${CurveAMM.MAX_U128_PRICE}`);
            }
        }

        if (iteration >= maxIterations) {
            throw new Error('达到最大迭代次数，无法找到合适的止损价格 / Reached maximum iterations, cannot find suitable stop loss price');
        }

        // Calculate final return values
        const executableStopLossPrice = stopLossStartPrice;

        // Calculate stop loss percentage
        // For short position, stop loss price is higher than current price, so it's a positive percentage
        const stopLossPercentage = Number((BigInt(10000) * (executableStopLossPrice - currentPrice)) / currentPrice) / 100;

        // Calculate leverage ratio
        // For short position, leverage = current price / (stop loss price - current price)
        const leverage = Number((BigInt(10000) * currentPrice) / (executableStopLossPrice - currentPrice)) / 10000;

        // Calculate margin requirement
        // Consistent with the contract formula (long_short.rs lines 890-894):
        //   real_margin_sol = close_buy_sol_with_fee - output_sol - fee_sol
        //   where output_sol is the net SOL after fees, and fee_sol is the open fee
        //   expanded: real_margin_sol = close_buy_sol_with_fee - raw_sell_sol
        let estimatedMargin = 0n;
        let rawSellSol = 0n; // Raw SOL obtained from selling tokens (before fees), for the caller to compute minSolOutput
        try {
            // 1. Calculate the raw SOL (before fees) obtained from selling tokens at the current price
            const sellResult = CurveAMM.sellFromPriceWithTokenInputWithParams(currentPrice, sellTokenAmount, initialVirtualSol, initialVirtualToken);
            if (sellResult) {
                rawSellSol = sellResult[1]; // Raw SOL obtained from the sale (before fees)

                // 2. Calculate the close cost (including fees, using ceiling division to match the contract)
                const closeCostWithFee = CurveAMM.calculateTotalAmountWithFee(finalTradeAmount, borrowFee);

                // 3. Margin = close cost (including fee) - raw sell SOL
                if (closeCostWithFee !== null && closeCostWithFee > rawSellSol) {
                    estimatedMargin = closeCostWithFee - rawSellSol;
                }
            }
        } catch (marginError) {
            console.warn('Failed to calculate estimated margin for short position:', marginError.message);
            // Keep estimatedMargin as 0n
        }

        // console.log(`Calculation completed:`);
        // console.log(`  Executable stop loss price: ${executableStopLossPrice}`);
        // console.log(`  SOL input amount: ${finalTradeAmount}`);
        // console.log(`  Stop loss percentage: ${stopLossPercentage}%`);
        // console.log(`  Leverage: ${leverage}x`);
        // console.log(`  Close insert indices: ${finalOverlapResult.close_insert_indices}`);

        return {
            executableStopLossPrice: executableStopLossPrice, // Calculated reasonable stop loss value
            tradeAmount: finalTradeAmount, // SOL input amount (SOL needed to buy back tokens at close)
            stopLossPercentage: stopLossPercentage, // Stop loss percentage relative to current price
            leverage: leverage, // Leverage ratio
            currentPrice: currentPrice, // Current price
            iterations: iteration, // Number of adjustments
            originalStopLossPrice: BigInt(stopLossPrice), // Original stop loss price
            close_insert_indices: finalOverlapResult.close_insert_indices, // Candidate insertion indices for closing order
            estimatedMargin: estimatedMargin, // Estimated margin requirement in SOL (lamports)
            rawSellSol: rawSellSol // Raw SOL obtained from selling tokens (before fees), used by the caller to compute minSolOutput
        };

    } catch (error) {
        console.error('Failed to simulate short position stop loss calculation:', error.message);
        throw error;
    }
}









/**
 * Simulate long position stop loss calculation with SOL amount input
 *
 * SOL-amount-based stop loss calculation for a long position. This function automatically computes the corresponding token amount,
 * so that the margin requirement is close to the SOL amount provided by the user.
 *
 * @param {string} mint - Token address
 * @param {bigint|string|number} buySolAmount - SOL amount to spend for long position (u64 format, lamports)
 * @param {bigint|string|number} stopLossPrice - User desired stop loss price (u128 format)
 * @param {Object|null} lastPrice - Token info, default null (auto-fetched if null)
 * @param {Object|null} ordersData - Orders data, default null (auto-fetched if null)
 * @param {number} borrowFee - Borrow fee rate, default 2000 (2000/100000 = 0.02%)
 *
 * @returns {Promise<Object>} Stop loss analysis result
 * @returns {bigint} returns.executableStopLossPrice - Executable stop loss price (u128 format) - same as {@link simulateLongStopLoss}
 * @returns {bigint} returns.tradeAmount - Estimated SOL amount obtained from selling at stop loss (lamports) - same as {@link simulateLongStopLoss}
 * @returns {number} returns.stopLossPercentage - Stop loss percentage - same as {@link simulateLongStopLoss}
 * @returns {number} returns.leverage - Leverage ratio - same as {@link simulateLongStopLoss}
 * @returns {bigint} returns.currentPrice - Current price (u128 format) - same as {@link simulateLongStopLoss}
 * @returns {number} returns.iterations - Number of price adjustment iterations - same as {@link simulateLongStopLoss}
 * @returns {bigint} returns.originalStopLossPrice - Original stop loss price (u128 format) - same as {@link simulateLongStopLoss}
 * @returns {number[]} returns.close_insert_indices - Candidate index array for the closing order insertion position ⭐ - same as {@link simulateLongStopLoss}
 * @returns {bigint} returns.estimatedMargin - Estimated required margin (SOL lamports) - same as {@link simulateLongStopLoss}
 * @returns {bigint} returns.buyTokenAmount - Calculated token amount to buy ⭐ Additional field
 *   - This is the token amount reverse-calculated from buySolAmount
 *   - Such that estimatedMargin is close to buySolAmount
 *   - Can be used directly as the buyTokenAmount parameter of sdk.trading.long()
 * @returns {number} returns.adjustmentIterations - Number of token amount adjustment iterations ⭐ Additional field
 *   - The number of iterations the binary search algorithm used to adjust the token amount
 *   - Used to assess calculation precision
 *
 * @throws {Error} When required parameters are missing
 * @throws {Error} When price or orders data cannot be fetched
 * @throws {Error} When the token amount cannot be calculated
 *
 * @example
 * // Basic usage: spend 0.1 SOL to go long, stop loss price at 97% of the current price
 * const result = await sdk.simulator.simulateLongSolStopLoss(
 *   '4Kq51Kt48FCwdo5CeKjRVPodH1ticHa7mZ5n5gqMEy1X',  // mint
 *   100000000n,                                        // 0.1 SOL (precision 10^9)
 *   BigInt('97000000000000000000')                     // stop loss price
 * );
 *
 * console.log(`Token amount to buy: ${result.buyTokenAmount}`);
 * console.log(`Estimated margin: ${result.estimatedMargin} lamports`);
 * console.log(`Insert position indices: ${result.close_insert_indices}`);
 *
 * @see {@link simulateLongStopLoss} Token-amount-based stop loss calculation for long positions
 * @see {@link simulateShortSolStopLoss} SOL-amount-based stop loss calculation for short positions
 * @since 2.0.0
 * @version 2.0.0 - Changed from returning prev_order_pda/next_order_pda to returning close_insert_indices
 */
async function simulateLongSolStopLoss(mint, buySolAmount, stopLossPrice, lastPrice = null, ordersData = null, borrowFee = null, initialVirtualSol = null, initialVirtualToken = null, curveAccount = null) {
    try {
        // Parameter validation
        if (!mint || !buySolAmount || !stopLossPrice) {
            throw new Error('Missing required parameters');
        }

        // If borrowFee or pool parameters are not provided, fetch them from the chain in a single call (supports passing in curveAccount externally to avoid duplicate RPC)
        if (borrowFee === null || initialVirtualSol === null || initialVirtualToken === null) {
            if (!curveAccount) {
                curveAccount = await this.sdk.chain.getCurveAccount(mint, { skipBalances: true });
            }
            if (borrowFee === null) borrowFee = curveAccount.borrowFee;
            if (initialVirtualSol === null) initialVirtualSol = new Decimal(curveAccount.initialVirtualSol.toString()).div(CurveAMM.SOL_PRECISION_FACTOR_DECIMAL).toString();
            if (initialVirtualToken === null) initialVirtualToken = new Decimal(curveAccount.initialVirtualToken.toString()).div(CurveAMM.TOKEN_PRECISION_FACTOR_DECIMAL).toString();
        }

        // Get current price if not provided
        let currentPrice;
        if (!lastPrice) {
            lastPrice = await this.sdk.data.price(mint);
            if (!lastPrice) {
                throw new Error('Failed to get current price');
            }
        }

        // Calculate current price
        if (lastPrice === null || lastPrice === undefined || lastPrice === '0') {
            currentPrice = CurveAMM.getInitialPrice();
        } else {
            currentPrice = BigInt(lastPrice);
            if (!currentPrice || currentPrice === 0n) {
                currentPrice = CurveAMM.getInitialPrice();
            }
        }

        // Calculate initial token amount from SOL amount using sellFromPriceWithSolOutput
        // This gives us how many tokens we can get when we later sell for buySolAmount SOL
        const initialResult = CurveAMM.sellFromPriceWithSolOutputWithParams(currentPrice, buySolAmount, initialVirtualSol, initialVirtualToken);
        if (!initialResult) {
            throw new Error('Failed to calculate token amount from SOL amount');
        }

        let buyTokenAmount = initialResult[1]; // Token amount
        let stopLossResult;
        let iterations = 0;
        const maxIterations = 50;

        // Dynamically compute the binary search upper bound based on the leverage ratio
        // At high leverage (e.g. 20x) the stop loss distance is small, each token contributes little margin, so more tokens are needed to consume the full margin
        // Calculate dynamic binary search upper bound based on leverage
        const stopLossPriceBigInt = BigInt(stopLossPrice);
        const priceDiff = currentPrice - stopLossPriceBigInt;
        const estimatedLeverage = priceDiff > 0n ? Number(currentPrice * 10000n / priceDiff) / 10000 : 10;
        const safeMultiplier = BigInt(Math.ceil(estimatedLeverage * 3)); // 3x safety factor
        const multiplier = safeMultiplier > 10n ? safeMultiplier : 10n; // minimum 10x

        // Use a binary search algorithm to find the maximum estimatedMargin that is less than buySolAmount
        // Use binary search algorithm to find maximum estimatedMargin that is less than buySolAmount
        let left = 1n; // minimum value, ensuring a valid lower bound
        let right = buyTokenAmount * multiplier; // upper bound: dynamically computed based on leverage
        let bestResult = null;
        let bestMargin = 0n; // record the maximum valid estimatedMargin
        let bestTokenAmount = buyTokenAmount;

        // Binary search main loop: find the maximum estimatedMargin that is less than buySolAmount
        while (iterations < maxIterations && left <= right) {
            const mid = (left + right) / 2n;

            // Calculate the result for the current token amount
            const currentResult = await simulateLongStopLoss.call(this, mint, mid, stopLossPrice, lastPrice, ordersData, borrowFee, initialVirtualSol, initialVirtualToken);
            const currentMargin = currentResult.estimatedMargin;

            //console.log(`Binary search iteration ${iterations}: tokenAmount=${mid}, estimatedMargin=${currentMargin}, target=${buySolAmount}`);

            // Only consider the case where estimatedMargin < buySolAmount
            if (currentMargin < BigInt(buySolAmount)) {
                // This is a valid solution, check whether it is better than the current best solution
                if (currentMargin > bestMargin) {
                    bestMargin = currentMargin;
                    bestResult = currentResult;
                    bestTokenAmount = mid;
                    //console.log(`Found better solution: estimatedMargin=${currentMargin}, tokenAmount=${mid}`);
                }

                // If the gap is already very small (within 10000000 lamports of the target), we can exit early
                if (BigInt(buySolAmount) - currentMargin <= 10000000n) {
                    //console.log(`Found optimal solution: estimatedMargin=${currentMargin}, diff=${BigInt(buySolAmount) - currentMargin} (< 10000000 lamports tolerance)`);
                    break;
                }

                // Continue searching to the right for a larger valid value
                left = mid + 1n;
            } else {
                // estimatedMargin >= buySolAmount, need to reduce tokenAmount
                //console.log(`estimatedMargin too large (${currentMargin} >= ${buySolAmount}), searching left`);
                right = mid - 1n;
            }

            iterations++;
        }

        // Ensure the found result meets the requirement
        if (bestResult && bestMargin < BigInt(buySolAmount)) {
            stopLossResult = bestResult;
            buyTokenAmount = bestTokenAmount;
            //console.log(`Binary search completed: best tokenAmount=${bestTokenAmount}, estimatedMargin=${bestMargin}, target=${buySolAmount}`);
        } else {
            // If no valid solution is found, use a very small tokenAmount as a safe fallback
            //console.log(`No valid solution found (estimatedMargin < buySolAmount), using minimal tokenAmount`);
            buyTokenAmount = buyTokenAmount / 10n; // use a smaller value
            if (buyTokenAmount <= 0n) buyTokenAmount = 1000000000n; // minimum value protection (0.001 token with 9 decimals)
            stopLossResult = await simulateLongStopLoss.call(this, mint, buyTokenAmount, stopLossPrice, lastPrice, ordersData, borrowFee, initialVirtualSol, initialVirtualToken);
        }

        // if (iterations >= maxIterations) {
        //     console.warn(`simulateLongSolStopLoss: Reached maximum iterations (${maxIterations}), tradeAmount=${stopLossResult.tradeAmount}, target=${buySolAmount}`);
        // }
        
        // Add buyTokenAmount and iteration info to the result
        return {
            ...stopLossResult,
            buyTokenAmount: buyTokenAmount,
            adjustmentIterations: iterations
        };

    } catch (error) {
        console.error('Failed to simulate long stop loss with SOL amount:', error.message);
        throw error;
    }
}

/**
 * Simulate short position stop loss calculation with SOL amount input
 *
 * SOL-amount-based stop loss calculation for a short position. This function automatically computes the corresponding token amount,
 * so that the margin requirement is close to the SOL amount provided by the user.
 *
 * @param {string} mint - Token address
 * @param {bigint|string|number} sellSolAmount - SOL amount needed for short position stop loss (u64 format, lamports)
 * @param {bigint|string|number} stopLossPrice - User desired stop loss price (u128 format)
 * @param {Object|null} lastPrice - Token info, default null (auto-fetched if null)
 * @param {Object|null} ordersData - Orders data, default null (auto-fetched if null)
 * @param {number} borrowFee - Borrow fee rate, default 2000 (2000/100000 = 0.02%)
 *
 * @returns {Promise<Object>} Stop loss analysis result
 * @returns {bigint} returns.executableStopLossPrice - Executable stop loss price (u128 format) - same as {@link simulateShortStopLoss}
 * @returns {bigint} returns.tradeAmount - Estimated SOL amount needed to buy at stop loss (lamports) - same as {@link simulateShortStopLoss}
 * @returns {number} returns.stopLossPercentage - Stop loss percentage - same as {@link simulateShortStopLoss}
 * @returns {number} returns.leverage - Leverage ratio - same as {@link simulateShortStopLoss}
 * @returns {bigint} returns.currentPrice - Current price (u128 format) - same as {@link simulateShortStopLoss}
 * @returns {number} returns.iterations - Number of price adjustment iterations - same as {@link simulateShortStopLoss}
 * @returns {bigint} returns.originalStopLossPrice - Original stop loss price (u128 format) - same as {@link simulateShortStopLoss}
 * @returns {number[]} returns.close_insert_indices - Candidate index array for the closing order insertion position ⭐ - same as {@link simulateShortStopLoss}
 * @returns {bigint} returns.estimatedMargin - Estimated required margin (SOL lamports) - same as {@link simulateShortStopLoss}
 * @returns {bigint} returns.sellTokenAmount - Calculated token amount to sell ⭐ Additional field
 *   - This is the token amount reverse-calculated from sellSolAmount
 *   - Such that estimatedMargin is close to sellSolAmount
 *   - Can be used directly as the borrowSellTokenAmount parameter of sdk.trading.short()
 * @returns {number} returns.adjustmentIterations - Number of token amount adjustment iterations ⭐ Additional field
 *   - The number of iterations the binary search algorithm used to adjust the token amount
 *   - Used to assess calculation precision
 *
 * @throws {Error} When required parameters are missing
 * @throws {Error} When price or orders data cannot be fetched
 * @throws {Error} When the token amount cannot be calculated
 *
 * @example
 * // Basic usage: spend 0.1 SOL to go short, stop loss price at 103% of the current price
 * const result = await sdk.simulator.simulateShortSolStopLoss(
 *   '4Kq51Kt48FCwdo5CeKjRVPodH1ticHa7mZ5n5gqMEy1X',  // mint
 *   100000000n,                                        // 0.1 SOL (precision 10^9)
 *   BigInt('103000000000000000000')                    // stop loss price
 * );
 *
 * console.log(`Token amount to sell: ${result.sellTokenAmount}`);
 * console.log(`Estimated margin: ${result.estimatedMargin} lamports`);
 * console.log(`Insert position indices: ${result.close_insert_indices}`);
 *
 * @see {@link simulateShortStopLoss} Token-amount-based stop loss calculation for short positions
 * @see {@link simulateLongSolStopLoss} SOL-amount-based stop loss calculation for long positions
 * @since 2.0.0
 * @version 2.0.0 - Changed from returning prev_order_pda/next_order_pda to returning close_insert_indices
 */
async function simulateShortSolStopLoss(mint, sellSolAmount, stopLossPrice, lastPrice = null, ordersData = null, borrowFee = null, initialVirtualSol = null, initialVirtualToken = null, curveAccount = null) {
    try {
        // Parameter validation
        if (!mint || !sellSolAmount || !stopLossPrice) {
            throw new Error('Missing required parameters');
        }

        // If borrowFee or pool parameters are not provided, fetch them from the chain in a single call (supports passing in curveAccount externally to avoid duplicate RPC)
        if (borrowFee === null || initialVirtualSol === null || initialVirtualToken === null) {
            if (!curveAccount) {
                curveAccount = await this.sdk.chain.getCurveAccount(mint, { skipBalances: true });
            }
            if (borrowFee === null) borrowFee = curveAccount.borrowFee;
            if (initialVirtualSol === null) initialVirtualSol = new Decimal(curveAccount.initialVirtualSol.toString()).div(CurveAMM.SOL_PRECISION_FACTOR_DECIMAL).toString();
            if (initialVirtualToken === null) initialVirtualToken = new Decimal(curveAccount.initialVirtualToken.toString()).div(CurveAMM.TOKEN_PRECISION_FACTOR_DECIMAL).toString();
        }

        // Get current price if not provided
        let currentPrice;
        if (!lastPrice) {
            lastPrice = await this.sdk.data.price(mint);
            if (!lastPrice) {
                throw new Error('Failed to get current price');
            }
        }

        //console.log("simulateShortSolStopLoss lastPrice=",lastPrice)

        // Calculate current price
        if (lastPrice === null || lastPrice === undefined || lastPrice === '0') {
            currentPrice = CurveAMM.getInitialPrice();
        } else {
            currentPrice = BigInt(lastPrice);
            if (!currentPrice || currentPrice === 0n) {
                currentPrice = CurveAMM.getInitialPrice();
            }
        }

        // Calculate initial token amount from SOL amount using buyFromPriceWithSolInput
        // This gives us how many tokens we need to buy later using sellSolAmount SOL
        const initialResult = CurveAMM.buyFromPriceWithSolInputWithParams(currentPrice, sellSolAmount, initialVirtualSol, initialVirtualToken);
        if (!initialResult) {
            throw new Error('Failed to calculate token amount from SOL amount');
        }

        let sellTokenAmount = initialResult[1]; // Token amount
        let stopLossResult;
        let iterations = 0;
        const maxIterations = 50;

        // Dynamically compute the binary search upper bound based on the leverage ratio
        // At high leverage (e.g. 20x) the stop loss distance is small, each token contributes little margin, so more tokens are needed to consume the full margin
        // Calculate dynamic binary search upper bound based on leverage
        const stopLossPriceBigInt = BigInt(stopLossPrice);
        const priceDiff = stopLossPriceBigInt - currentPrice;
        const estimatedLeverage = priceDiff > 0n ? Number(currentPrice * 10000n / priceDiff) / 10000 : 10;
        const safeMultiplier = BigInt(Math.ceil(estimatedLeverage * 3)); // 3x safety factor
        const multiplier = safeMultiplier > 10n ? safeMultiplier : 10n; // minimum 10x

        // Use a binary search algorithm to find the maximum estimatedMargin that is less than sellSolAmount
        // Use binary search algorithm to find maximum estimatedMargin that is less than sellSolAmount
        let left = 1n; // minimum value, ensuring a valid lower bound
        let right = sellTokenAmount * multiplier; // upper bound: dynamically computed based on leverage
        let bestResult = null;
        let bestMargin = 0n; // record the maximum valid estimatedMargin
        let bestTokenAmount = sellTokenAmount;

        // Binary search main loop: find the maximum estimatedMargin that is less than sellSolAmount
        while (iterations < maxIterations && left <= right) {
            const mid = (left + right) / 2n;

            // Calculate the result for the current token amount
            const currentResult = await simulateShortStopLoss.call(this, mint, mid, stopLossPrice, lastPrice, ordersData, borrowFee, initialVirtualSol, initialVirtualToken);
            const currentMargin = currentResult.estimatedMargin;

            //console.log(`Binary search iteration ${iterations}: tokenAmount=${mid}, estimatedMargin=${currentMargin}, target=${sellSolAmount}`);

            // Only consider the case where estimatedMargin < sellSolAmount
            if (currentMargin < BigInt(sellSolAmount)) {
                // This is a valid solution, check whether it is better than the current best solution
                if (currentMargin > bestMargin) {
                    bestMargin = currentMargin;
                    bestResult = currentResult;
                    bestTokenAmount = mid;
                    //console.log(`Found better solution: estimatedMargin=${currentMargin}, tokenAmount=${mid}`);
                }

                // If the gap is already very small (within 10000000 lamports of the target), we can exit early
                if (BigInt(sellSolAmount) - currentMargin <= 10000000n) {
                    //console.log(`Found optimal solution: estimatedMargin=${currentMargin}, diff=${BigInt(sellSolAmount) - currentMargin} (< 10000000 lamports tolerance)`);
                    break;
                }

                // Continue searching to the right for a larger valid value
                left = mid + 1n;
            } else {
                // estimatedMargin >= sellSolAmount, need to reduce tokenAmount
                //console.log(`estimatedMargin too large (${currentMargin} >= ${sellSolAmount}), searching left`);
                right = mid - 1n;
            }

            iterations++;
        }

        // Ensure the found result meets the requirement
        if (bestResult && bestMargin < BigInt(sellSolAmount)) {
            stopLossResult = bestResult;
            sellTokenAmount = bestTokenAmount;
            //console.log(`Binary search completed: best tokenAmount=${bestTokenAmount}, estimatedMargin=${bestMargin}, target=${sellSolAmount}`);
        } else {
            // If no valid solution is found, use a very small tokenAmount as a safe fallback
            //console.log(`No valid solution found (estimatedMargin < sellSolAmount), using minimal tokenAmount`);
            sellTokenAmount = sellTokenAmount / 10n; // use a smaller value
            if (sellTokenAmount <= 0n) sellTokenAmount = 1000000000n; // minimum value protection (0.001 token with 9 decimals)
            stopLossResult = await simulateShortStopLoss.call(this, mint, sellTokenAmount, stopLossPrice, lastPrice, ordersData, borrowFee, initialVirtualSol, initialVirtualToken);
        }

        // if (iterations >= maxIterations) {
        //     //console.warn(`simulateShortSolStopLoss: Reached maximum iterations (${maxIterations}), tradeAmount=${stopLossResult.tradeAmount}, target=${sellSolAmount}`);
        // }
        
        // Add sellTokenAmount and iteration info to the result
        return {
            ...stopLossResult,
            sellTokenAmount: sellTokenAmount,
            adjustmentIterations: iterations
        };

    } catch (error) {
        console.error('Failed to simulate short stop loss with SOL amount:', error.message);
        throw error;
    }
}

module.exports = {
    simulateLongStopLoss,
    simulateShortStopLoss,
    simulateLongSolStopLoss,
    simulateShortSolStopLoss
};