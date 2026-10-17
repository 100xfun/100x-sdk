
const CurveAMM = require('../../utils/curve_amm');

/**
 * Calculate the amount of Token obtainable when buying with a specified amount of SOL
 * @param {bigint|string} price - Current trade price (u128 format)
 * @param {bigint|string|number} buySolAmount - Amount of SOL to spend (lamports, 9-digit precision)
 * @param {Array} orders - Array of orders locking liquidity
 * @param {number} onceMaxOrder - Maximum number of orders per loop iteration
 * @param {string|number|null} passOrderID - Order ID to skip (compared against the order_id field)
 * @param {string|number|null} initialVirtualSol - Liquidity pool SOL amount
 * @param {string|number|null} initialVirtualToken - Liquidity pool Token amount
 * @returns {Object} { tokenAmount: bigint, msg: string, closedOrdersCount: number }
 */
function calcLiqSolBuy(price, buySolAmount, orders, onceMaxOrder, passOrderID = null, initialVirtualSol = null, initialVirtualToken = null){


    //console.log("calcLiqSolBuy: , price, buySolAmount, orders, onceMaxOrder, passOrderID , initialVirtualSol, initialVirtualToken=", price, buySolAmount, orders, onceMaxOrder, passOrderID , initialVirtualSol , initialVirtualToken);

    // 1. Parameter validation
    // Convert to bigint for comparison
    let priceBigInt;
    let buySolAmountBigInt;

    try {
        priceBigInt = typeof price === 'bigint' ? price : BigInt(price);
        buySolAmountBigInt = typeof buySolAmount === 'bigint' ? buySolAmount : BigInt(buySolAmount);
    } catch (error) {
        return {
            tokenAmount: 0n,
            msg: '参数格式错误：无法转换为bigint',
            closedOrdersCount: 0
        };
    }

    // Check whether price and amount are valid
    if (priceBigInt <= 0n) {
        return {
            tokenAmount: 0n,
            msg: '计算失败：价格必须大于0',
            closedOrdersCount: 0
        };
    }

    if (buySolAmountBigInt <= 0n) {
        return {
            tokenAmount: 0n,
            msg: '计算失败：买入金额必须大于0',
            closedOrdersCount: 0
        };
    }

    // 2. Set default liquidity pool parameters
    const Decimal = require('decimal.js');
    const virtualSol = initialVirtualSol !== null
        ? new Decimal(initialVirtualSol.toString()).div(CurveAMM.SOL_PRECISION_FACTOR_DECIMAL)
        : CurveAMM.INITIAL_SOL_RESERVE_DECIMAL;
    const virtualToken = initialVirtualToken !== null
        ? new Decimal(initialVirtualToken.toString()).div(CurveAMM.TOKEN_PRECISION_FACTOR_DECIMAL)
        : CurveAMM.INITIAL_TOKEN_RESERVE_DECIMAL;

    //console.log("calcLiqSolBuy: virtualSol,virtualToken=",virtualSol,virtualToken)


    // 3. Handle the empty orders case (first stage)
    if (!orders || orders.length === 0) {
        // Directly calculate the buy under full liquidity
        const result = CurveAMM.buyFromPriceWithSolInputWithParams(
            price,
            buySolAmount,
            virtualSol,
            virtualToken
        );

        if (result === null) {
            return {
                tokenAmount: 0n,
                msg: '计算失败：价格或参数无效',
                closedOrdersCount: 0
            };
        }

        const [endPrice, tokenAmount] = result;
        return {
            tokenAmount: tokenAmount,
            msg: '流动性完整，无锁定订单',
            closedOrdersCount: 0
        };
    }

    // 4. Handle the case with orders (second stage: segmented liquidity calculation)

    // Initialize variables
    let currentPrice = priceBigInt;           // Current price pointer
    let remainingSol = buySolAmountBigInt;    // Remaining available SOL
    let totalTokenAmount = 0n;                // Accumulated tokens obtained
    let closedOrdersCount = 0;                // Number of closed orders
    let processedOrders = 0;                  // Number of processed orders

    // Check whether the current price is higher than the first order's end price
    if (orders.length > 0) {
        const firstOrderEndPrice = typeof orders[0].lock_lp_end_price === 'bigint'
            ? orders[0].lock_lp_end_price
            : BigInt(orders[0].lock_lp_end_price);

        if (currentPrice >= firstOrderEndPrice) {
            return {
                tokenAmount: 0n,
                msg: '错误：当前价格已高于第一个订单的结束价格',
                closedOrdersCount: 0
            };
        }
    }

    // Iterate over orders (up to onceMaxOrder)
    for (let i = 0; i < orders.length && processedOrders < onceMaxOrder; i++) {
        const order = orders[i];

        // Check whether this order needs to be skipped
        if (passOrderID !== null && order.order_id !== undefined) {
            // Convert both to strings for comparison
            const orderIdStr = String(order.order_id);
            const passOrderIdStr = String(passOrderID);

            if (orderIdStr === passOrderIdStr) {
                // Skip this order, do not process its lock range, continue to the next order
                continue;
            }
        }

        // Convert order prices to bigint
        let lockStartPrice, lockEndPrice;
        try {
            lockStartPrice = typeof order.lock_lp_start_price === 'bigint'
                ? order.lock_lp_start_price
                : BigInt(order.lock_lp_start_price);
            lockEndPrice = typeof order.lock_lp_end_price === 'bigint'
                ? order.lock_lp_end_price
                : BigInt(order.lock_lp_end_price);
        } catch (error) {
            return {
                tokenAmount: 0n,
                msg: `错误：订单${i}的价格格式无效`,
                closedOrdersCount: closedOrdersCount
            };
        }

        // Step 1: Calculate the available range (currentPrice → lockStartPrice)
        if (currentPrice < lockStartPrice) {
            // 1.1 Calculate how much SOL this range needs and how many tokens can be obtained
            const result = CurveAMM.buyFromPriceToPriceWithParams(
                currentPrice,
                lockStartPrice,
                virtualSol,
                virtualToken
            );

            // Check whether the calculation succeeded
            if (result === null) {
                return {
                    tokenAmount: 0n,
                    msg: `错误：计算价格区间失败（订单${i}）`,
                    closedOrdersCount: closedOrdersCount
                };
            }

            const [solNeeded, tokenGained] = result;

            // 1.2 Determine whether the remaining SOL is sufficient
            if (remainingSol >= solNeeded) {
                // Sufficient: buy through this range and continue to the next segment
                remainingSol -= solNeeded;
                totalTokenAmount += tokenGained;
                currentPrice = lockStartPrice;
            } else {
                // Insufficient: use up the remaining SOL, calculate how much can be bought, then return
                const finalResult = CurveAMM.buyFromPriceWithSolInputWithParams(
                    currentPrice,
                    remainingSol,
                    virtualSol,
                    virtualToken
                );

                if (finalResult === null) {
                    return {
                        tokenAmount: 0n,
                        msg: '错误：计算最终买入失败',
                        closedOrdersCount: closedOrdersCount
                    };
                }

                const [finalPrice, finalTokenGained] = finalResult;
                totalTokenAmount += finalTokenGained;

                return {
                    tokenAmount: totalTokenAmount,
                    msg: `SOL用完，最终价格: ${finalPrice.toString()}`,
                    closedOrdersCount: closedOrdersCount
                };
            }
        }

        // Step 2: Skip the lock range (lockStartPrice → lockEndPrice)
        currentPrice = lockEndPrice;
        processedOrders++;

        // Step 3: Determine whether the order is closed
        // If the price reaches lockEndPrice, this order is closed
        closedOrdersCount++;

        // Check whether SOL has been used up
        if (remainingSol === 0n) {
            return {
                tokenAmount: totalTokenAmount,
                msg: `SOL刚好用完，最终价格: ${currentPrice.toString()}`,
                closedOrdersCount: closedOrdersCount
            };
        }
    }

    // Step 4: Handle the final infinite liquidity range
    // After all orders are processed, continue buying with the remaining SOL
    if (remainingSol > 0n) {
        const finalResult = CurveAMM.buyFromPriceWithSolInputWithParams(
            currentPrice,
            remainingSol,
            virtualSol,
            virtualToken
        );

        if (finalResult === null) {
            return {
                tokenAmount: 0n,
                msg: '错误：计算无限流动性区间失败',
                closedOrdersCount: closedOrdersCount
            };
        }

        const [finalPrice, finalTokenGained] = finalResult;
        totalTokenAmount += finalTokenGained;

        return {
            tokenAmount: totalTokenAmount,
            msg: `买入完成，最终价格: ${finalPrice.toString()}`,
            closedOrdersCount: closedOrdersCount
        };
    }

    // Step 5: SOL is exactly used up
    return {
        tokenAmount: totalTokenAmount,
        msg: `SOL刚好用完，最终价格: ${currentPrice.toString()}`,
        closedOrdersCount: closedOrdersCount
    };

}


function calcLiqSolSell(price, sellSolAmount, orders, onceMaxOrder, passOrder = null, initialVirtualSol = null, initialVirtualToken = null) {


}


module.exports = {
  calcLiqSolBuy,
  calcLiqSolSell
};