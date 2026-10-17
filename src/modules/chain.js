
const { PublicKey } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const CurveAMM = require('../utils/curve_amm');
// Use the buffer package uniformly, consistent across all platforms
const { Buffer } = require('buffer');

/**
 * Chain Data Module
 * When no auxiliary server is available, directly call on-chain data to get transaction parameters
 * The downside is that during peak trading periods, on-chain data may have delays, causing transaction failures
 * Provides functionality to read account data from Solana blockchain
 */
class ChainModule {
  constructor(sdk) {
    this.sdk = sdk;
    // getCurveAccount cache: key = mint string, value = { data, timestamp }
    this._curveAccountCache = new Map();
    this._CACHE_TTL = 10000; // 10 second TTL
  }

  /**
   * Clear the curveAccount cache for a specified mint (called after a transaction)
   * @param {string} [mint] - Specified mint address; clears all if not provided
   */
  invalidateCurveCache(mint) {
    if (mint) {
      this._curveAccountCache.delete(typeof mint === 'string' ? mint : mint.toString());
    } else {
      this._curveAccountCache.clear();
    }
  }

  /**
   * Get complete curve_account (BorrowingBondingCurve) data
   *
   * Read the borrowing liquidity pool account data for a specified token from the blockchain,
   * including addresses and balance information for all related accounts.
   * This function automatically calculates related PDA addresses and concurrently queries all balances,
   * providing complete liquidity pool status.
   *
   * @param {string|PublicKey} mint - Token mint account address
   *
   * @returns {Promise<Object>} Complete BorrowingBondingCurve account data object
   *
   * @returns {Promise<Object>} Return object contains following complete fields:
   *
   * **Core Reserve Data:**
   * @returns {bigint} returns.lpTokenReserve - LP Token reserves, total reserves of liquidity provider tokens
   * @returns {bigint} returns.lpSolReserve - LP SOL reserves, SOL reserves in the liquidity pool
   * @returns {bigint} returns.price - Current token price, calculated based on AMM algorithm
   * @returns {bigint} returns.borrowTokenReserve - Borrowable Token reserves, borrowable token reserves
   * @returns {bigint} returns.borrowSolReserve - Borrowable SOL reserves, borrowable SOL reserves
   *
   * **Fee and Parameter Configuration:**
   * @returns {number} returns.swapFee - Swap fee rate, expressed in basis points (e.g. 100 = 1%)
   * @returns {number} returns.borrowFee - Borrow fee rate, expressed in basis points
   * @returns {number} returns.feeDiscountFlag - Fee discount flag (0: normal, 1: 50% off, 2: 25% off, 3: 12.5% off)
   * @returns {number} returns.feeSplit - Fee split ratio, determines how fees are distributed among different recipients
   * @returns {number} returns.borrowDuration - Borrow duration, in seconds
   * @returns {number} returns.bump - curve_account PDA bump seed
   *
   * **Account Addresses:**
   * @returns {string} returns.baseFeeRecipient - Base fee recipient address, receives base transaction fees
   * @returns {string} returns.feeRecipient - Fee recipient address, receives additional fee income
   * @returns {string} returns.mint - Token mint account address
   * @returns {string} returns.upOrderbook - Up orderbook (short orders) PDA address
   * @returns {string} returns.downOrderbook - Down orderbook (long orders) PDA address
   * @returns {string} returns.creator - Token creator address, the wallet that created this token
   * @returns {string} returns.poolTokenAccount - Pool token account address, stores tokens in the liquidity pool
   * @returns {string} returns.poolBorrowTokenAccount - Pool borrow token account address (PDA seed "pool_borrow_token"), stores tokens for the borrow pool
   * @returns {string} returns.poolSolAccount - Pool SOL account address, stores native SOL in the liquidity pool
   *
   * **Dynamic Liquidity Pool Parameters:**
   * @returns {bigint} returns.initialVirtualSol - Initial virtual SOL reserve (lamports), used for k value / price curve
   * @returns {bigint} returns.initialVirtualToken - Initial virtual Token reserve (smallest unit), used for k value / price curve
   * @returns {bigint} returns.initialBorrowTokenReserve - Borrow pool initial funding (smallest unit), never changes after creation. Borrowed out = initialBorrowTokenReserve - borrowTokenReserve
   * @returns {number} returns.poolType - Pool type (0: basic version, 1: advanced version)
   * @returns {number} returns.borrowPoolRatio - Borrow pool token ratio (5-30 means 5%-30%, basic version fixed at 20)
   *
   * **Token Supply Information:**
   * @returns {bigint} returns.totalSupply - Total token supply (smallest unit)
   * @returns {number} returns.decimals - Token decimal places
   * @returns {bigint} returns.initialBorrowPool - Initial borrow pool size (= initialBorrowTokenReserve from chain)
   * @returns {bigint} returns.circulatingSupply - Circulating supply = totalSupply - borrowTokenReserve
   *
   * **Balance Information:**
   * @returns {number} returns.baseFeeRecipientBalance - SOL balance of base fee recipient address (lamports)
   * @returns {number} returns.feeRecipientBalance - SOL balance of fee recipient address (lamports)
   * @returns {bigint} returns.poolTokenBalance - Token balance of pool token account
   * @returns {number} returns.poolSolBalance - SOL balance of pool SOL account (lamports)
   *
   * **Metadata:**
   * @returns {Object} returns._metadata - Additional metadata information
   * @returns {string} returns._metadata.accountAddress - Complete address of curve_account
   * @returns {string} returns._metadata.mintAddress - Input token mint address
   *
   * @throws {Error} Throws error when curve_account does not exist
   * @throws {Error} Throws error when unable to decode account data
   * @throws {Error} Throws error when network connection fails
   *
   * @example
   * // Basic usage example
   * try {
   *   const curveData = await sdk.chain.getCurveAccount('3YggGtxXEGBbjK1WLj2Z79doZC2gkCWXag1ag8BD4cYY');
   *
   *   // Display core reserve information
   *   console.log('=== Core Reserve Data ===');
   *   console.log('LP Token reserves:', curveData.lpTokenReserve.toString());
   *   console.log('LP SOL reserves:', curveData.lpSolReserve.toString());
   *   console.log('Current price:', curveData.price.toString());
   *   console.log('Borrow Token reserves:', curveData.borrowTokenReserve.toString());
   *   console.log('Borrow SOL reserves:', curveData.borrowSolReserve.toString());
   *
   *   // Display fee configuration
   *   console.log('=== Fee Configuration ===');
   *   console.log('Swap fee rate:', curveData.swapFee / 100, '%');
   *   console.log('Borrow fee rate:', curveData.borrowFee / 100, '%');
   *   console.log('Fee discount flag:', curveData.feeDiscountFlag);
   *   console.log('Borrow duration:', curveData.borrowDuration, 'seconds');
   *
   *   // Display account addresses
   *   console.log('=== Account Addresses ===');
   *   console.log('Token creator:', curveData.creator);
   *   console.log('Base fee recipient address:', curveData.baseFeeRecipient);
   *   console.log('Fee recipient address:', curveData.feeRecipient);
   *   console.log('Pool token account:', curveData.poolTokenAccount);
   *   console.log('Pool SOL account:', curveData.poolSolAccount);
   *
   *   // Display balance information
   *   console.log('=== Balance Information ===');
   *   console.log('Base fee recipient balance:', curveData.baseFeeRecipientBalance / 1e9, 'SOL');
   *   console.log('Fee recipient balance:', curveData.feeRecipientBalance / 1e9, 'SOL');
   *   console.log('Pool token balance:', curveData.poolTokenBalance.toString());
   *   console.log('Pool SOL balance:', curveData.poolSolBalance / 1e9, 'SOL');
   *
   *   // Display orderbook addresses
   *   console.log('=== Order Books ===');
   *   console.log('Up orderbook (short):', curveData.upOrderbook);
   *   console.log('Down orderbook (long):', curveData.downOrderbook);
   *
   * } catch (error) {
   *   console.error('Failed to get curve account:', error.message);
   * }
   *
   * @example
   * // Pool monitoring example
   * async function monitorPool(mintAddress) {
   *   const data = await sdk.chain.getCurveAccount(mintAddress);
   *
   *   // Calculate pool utilization
   *   const tokenUtilization = Number(data.lpTokenReserve - data.poolTokenBalance) / Number(data.lpTokenReserve);
   *   const solUtilization = Number(data.lpSolReserve - BigInt(data.poolSolBalance)) / Number(data.lpSolReserve);
   *
   *   console.log('Token utilization:', (tokenUtilization * 100).toFixed(2), '%');
   *   console.log('SOL utilization:', (solUtilization * 100).toFixed(2), '%');
   *
   *   // Check fee earnings
   *   const totalFeeBalance = data.baseFeeRecipientBalance + data.feeRecipientBalance;
   *   console.log('Total fee earnings:', totalFeeBalance / 1e9, 'SOL');
   *
   *   return {
   *     tokenUtilization,
   *     solUtilization,
   *     totalFeeBalance,
   *     currentPrice: data.price
   *   };
   * }
   *
   * @since 1.0.0
   * @version 2.0.0 - Updated to use new OrderBook structure (up_orderbook/down_orderbook instead of upHead/downHead)
   * @author 100x SDK Team
   */
  async getCurveAccount(mint, options = {}) {
    const { skipBalances = false } = options;
    try {
      // Parameter validation and conversion
      const mintPubkey = typeof mint === 'string' ? new PublicKey(mint) : mint;
      const mintKey = mintPubkey.toString();

      // Check cache
      const cached = this._curveAccountCache.get(mintKey);
      if (cached && (Date.now() - cached.timestamp < this._CACHE_TTL)) {
        // Cache hit: if the request includes balances but the cache doesn't, re-fetch the balance part
        if (!skipBalances && cached.skipBalances) {
          // The cache is from skipBalances, but balances are now needed, so a supplementary query is required
        } else {
          return cached.data;
        }
      }

      // Calculate curve_account PDA address
      // Use the same seeds as in the contract: [b"borrowing_curve", mint_account.key().as_ref()]
      const [curveAccountPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("borrowing_curve"),
          mintPubkey.toBuffer()
        ],
        this.sdk.programId
      );

      // Use Anchor program to fetch account data directly
      // Method 1: Use program's fetch method
      let decodedData;
      try {
        decodedData = await this.sdk.program.account.borrowingBondingCurve.fetch(curveAccountPDA);
      } catch (fetchError) {
        // Method 2: If fetch fails, use raw method
        const accountInfo = await this.sdk.connection.getAccountInfo(curveAccountPDA);
        if (!accountInfo) {
          throw new Error(`curve_account does not exist`);
        }

        // Manually decode with BorshAccountsCoder
        const accountsCoder = new anchor.BorshAccountsCoder(this.sdk.program.idl);

        // Try different account names
        try {
          decodedData = accountsCoder.decode('BorrowingBondingCurve', accountInfo.data);
        } catch (decodeError1) {
          try {
            // Try lowercase name
            decodedData = accountsCoder.decode('borrowingBondingCurve', accountInfo.data);
          } catch (decodeError2) {
            // Both failed, throw original error
            throw new Error(`Cannot decode account data: ${decodeError1.message}`);
          }
        }
      }

      // Calculate pool account PDA addresses
      const [poolTokenAccountPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("pool_token"),
          mintPubkey.toBuffer()
        ],
        this.sdk.programId
      );

      // Dedicated token account PDA for the borrow pool (added in the contract, seed = "pool_borrow_token")
      const [poolBorrowTokenAccountPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("pool_borrow_token"),
          mintPubkey.toBuffer()
        ],
        this.sdk.programId
      );

      const [poolSolAccountPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("pool_sol"),
          mintPubkey.toBuffer()
        ],
        this.sdk.programId
      );

      // Query balances (skip if not needed)
      let baseFeeRecipientBalance = 0;
      let feeRecipientBalance = 0;
      let poolTokenBalance = { value: { amount: '0' } };
      let poolBorrowTokenBalance = { value: { amount: '0' } };
      let poolSolBalance = 0;
      let tokenSupply = { value: { amount: '0', decimals: 0 } };

      if (!skipBalances) {
        [
          baseFeeRecipientBalance,
          feeRecipientBalance,
          poolTokenBalance,
          poolBorrowTokenBalance,
          poolSolBalance,
          tokenSupply
        ] = await Promise.all([
          this.sdk.connection.getBalance(decodedData.baseFeeRecipient),
          this.sdk.connection.getBalance(decodedData.feeRecipient),
          this.sdk.connection.getTokenAccountBalance(poolTokenAccountPDA).catch(() => ({ value: { amount: '0' } })),
          this.sdk.connection.getTokenAccountBalance(poolBorrowTokenAccountPDA).catch(() => ({ value: { amount: '0' } })),
          this.sdk.connection.getBalance(poolSolAccountPDA),
          this.sdk.connection.getTokenSupply(mintPubkey)
        ]);
      }

      // Convert data format
      const convertedData = {
        // BN types convert to bigint
        lpTokenReserve: BigInt(decodedData.lpTokenReserve.toString()),
        lpSolReserve: BigInt(decodedData.lpSolReserve.toString()),
        price: BigInt(decodedData.price.toString()),
        borrowTokenReserve: BigInt(decodedData.borrowTokenReserve.toString()),
        borrowSolReserve: BigInt(decodedData.borrowSolReserve.toString()),

        // Numeric types remain unchanged
        swapFee: decodedData.swapFee,
        borrowFee: decodedData.borrowFee,
        feeDiscountFlag: decodedData.feeDiscountFlag,
        feeSplit: decodedData.feeSplit,
        borrowDuration: decodedData.borrowDuration,
        bump: decodedData.bump,

        // PublicKey types convert to string
        baseFeeRecipient: decodedData.baseFeeRecipient.toString(),
        feeRecipient: decodedData.feeRecipient.toString(),
        mint: decodedData.mint.toString(),

        // New OrderBook structure - always has value (not optional)
        upOrderbook: decodedData.upOrderbook.toString(),
        downOrderbook: decodedData.downOrderbook.toString(),

        // Creator address
        creator: decodedData.creator.toString(),

        // === Phase 1 new fields: dynamic liquidity pool parameters ===
        initialVirtualSol: BigInt(decodedData.initialVirtualSol.toString()),        // u64, lamports
        initialVirtualToken: BigInt(decodedData.initialVirtualToken.toString()),    // u64, smallest unit

        // Borrow pool initial funding (added in the contract), never changes after creation
        // Borrowed out amount = initialBorrowTokenReserve - borrowTokenReserve
        initialBorrowTokenReserve: BigInt(decodedData.initialBorrowTokenReserve.toString()), // u64, smallest unit

        // === Phase 2 new fields: advanced version pool parameters ===
        poolType: decodedData.poolType,                           // u8, 0=basic version, 1=advanced version
        borrowPoolRatio: decodedData.borrowPoolRatio,            // u8, 5-30 means 5%-30%

        // Token Supply information
        totalSupply: BigInt(tokenSupply.value.amount),
        decimals: tokenSupply.value.decimals,
        // Borrow pool initial total, taken directly from the on-chain field (old formula totalSupply - initialVirtualToken is deprecated)
        initialBorrowPool: BigInt(decodedData.initialBorrowTokenReserve.toString()),
        circulatingSupply: BigInt(decodedData.initialVirtualToken.toString())
          + (BigInt(tokenSupply.value.amount) - BigInt(decodedData.initialVirtualToken.toString()) - BigInt(decodedData.borrowTokenReserve.toString())),

        // SOL balance information
        baseFeeRecipientBalance: baseFeeRecipientBalance,  // Unit: lamports
        feeRecipientBalance: feeRecipientBalance,          // Unit: lamports

        // Pool account information
        poolTokenAccount: poolTokenAccountPDA.toString(),                 // Pool token account address
        poolBorrowTokenAccount: poolBorrowTokenAccountPDA.toString(),     // Pool borrow token account address (added)
        poolSolAccount: poolSolAccountPDA.toString(),                     // Pool SOL account address
        poolTokenBalance: BigInt(poolTokenBalance.value.amount),          // Pool token balance
        poolBorrowTokenBalance: BigInt(poolBorrowTokenBalance.value.amount), // Pool borrow token balance (= borrowTokenReserve, added)
        poolSolBalance: poolSolBalance,                                   // Pool SOL balance (lamports)

        // Additional metadata
        _metadata: {
          accountAddress: curveAccountPDA.toString(),
          mintAddress: mintPubkey.toString()
        }
      };

      // Write to cache
      this._curveAccountCache.set(mintKey, {
        data: convertedData,
        timestamp: Date.now(),
        skipBalances: skipBalances
      });

      // Return converted data
      return convertedData;

    } catch (error) {
      // Provide concise error information
      if (error.message.includes('Account does not exist')) {
        throw new Error(`curve_account does not exist for mint: ${mint}`);
      } else {
        throw new Error(`Failed to get curve_account: ${error.message}`);
      }
    }
  }

 

  /**
   * Calculate curve_account PDA address
   * 
   * @param {string|PublicKey} mint - Token mint address
   * @returns {PublicKey} curve_account PDA address
   * 
   * @example
   * const curveAddress = sdk.chain.getCurveAccountAddress('3YggGtxXEGBbjK1WLj2Z79doZC2gkCWXag1ag8BD4cYY');
   * console.log('Curve Account Address:', curveAddress.toString());
   */
  getCurveAccountAddress(mint) {
    const mintPubkey = typeof mint === 'string' ? new PublicKey(mint) : mint;

    const [curveAccountPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("borrowing_curve"),
        mintPubkey.toBuffer()
      ],
      this.sdk.programId
    );

    return curveAccountPDA;
  }

  /**
   * Get price data (read price from chain curveAccountPDA)
   * @param {string} mint - Token address
   * @returns {Promise<string>} Latest price string
   * 
   * @example
   * // Get latest token price
   * const price = await sdk.chain.price('56hfrQYiyRSUZdRKDuUvsqRik8j2UDW9kCisy7BiRxmg');
   * console.log('Latest price:', price); // "13514066072452801812769"
   */
  async price(mint) {
    // Validate input
    if (!mint || typeof mint !== 'string') {
      throw new Error('price: mint address must be a valid string');
    }

    try {
      // Reuse the getCurveAccount cache to avoid re-fetching the same account
      const curveData = await this.getCurveAccount(mint, { skipBalances: true });
      const price = curveData.price;

      if (price && price !== 0n) {
        return price.toString();
      } else {
        const initialPrice = CurveAMM.getInitialPrice();
        if (initialPrice === null) {
          throw new Error('price: Unable to calculate initial price');
        }
        return initialPrice.toString();
      }

    } catch (error) {
      // If getting fails, return initial price
      console.warn(`price: Failed to get chain price, using initial price: ${error.message}`);

      const initialPrice = CurveAMM.getInitialPrice();
      if (initialPrice === null) {
        throw new Error('price: Unable to calculate initial price');
      }
      return initialPrice.toString();
    }
  }

  /**
   * Get Orders Data (Read from Chain using new OrderBook structure)
   * Returns ALL orders regardless of pagination parameters (for compatibility)
   * @param {string} mint - Token mint address
   * @param {Object} options - Query parameters (page and limit are ignored but kept for compatibility)
   * @param {string} options.type - Order type: "up_orders" (short) or "down_orders" (long)
   * @param {number} options.page - Page number (ignored, always returns all data)
   * @param {number} options.limit - Items per page (ignored, always returns all data)
   * @returns {Promise<Object>} Order data with ALL orders
   *
   * @example
   * // Get long orders (returns ALL orders)
   * const ordersData = await sdk.chain.orders('6ZDJtGFTzrF3FaN5uaqa1h8EexW7BtQd4FwA9Dt7m3ee', { type: 'down_orders' });
   *
   * // Return value example:
   * // {
   * //   "success": true,
   * //   "data": {
   * //     "orders": [
   * //       {
   * //         "order_type": "down_orders",                           // Order type string (converted)
   * //         "mint": "6ZDJtGFTzrF3FaN5uaqa1h8EexW7BtQd4FwA9Dt7m3ee", // Token address
   * //         "user": "JD1eNPaJpbtejKfgimbLYLkvpsTHyYzKCCozVLGLS6zu",   // User address
   * //         "lock_lp_start_price": "46618228118401293964111",        // LP start price (string)
   * //         "lock_lp_end_price": "45827474968448818396222",         // LP end price (string)
   * //         "open_price": "46222851543425056180166",                // Open price (string) - NEW
   * //         "order_id": "12345",                                    // Order ID (u64 as string) - NEW
   * //         "lock_lp_sol_amount": 3299491609,                       // LP locked SOL amount (lamports)
   * //         "lock_lp_token_amount": 713848715669,                   // LP locked token amount (min unit)
   * //         "next_lp_sol_amount": 3299491609,                       // Next LP SOL amount (lamports) - NEW
   * //         "next_lp_token_amount": 713848715669,                   // Next LP token amount (min unit) - NEW
   * //         "start_time": 1756352482,                               // Start time (Unix timestamp, i64 as number)
   * //         "end_time": 1756525282,                                 // End time (Unix timestamp, i64 as number)
   * //         "margin_init_sol_amount": 571062973,                    // Initial margin SOL amount (lamports) - NEW
   * //         "margin_sol_amount": 571062973,                         // Margin SOL amount (lamports)
   * //         "borrow_amount": 3860656108,                            // Borrow amount (lamports)
   * //         "position_asset_amount": 713848715669,                  // Position asset amount (min unit)
   * //         "realized_sol_amount": 0,                               // Realized SOL amount (lamports) - NEW
   * //         "borrow_fee": 300,                                      // Borrow fee (basis points, 300 = 3%)
   * //         "index": 0,                                             // Order index in OrderBook (currentIndex)
   * //         "next_order": 1,                                        // Next order index in linked list (u16, 65535=none) - NEW
   * //         "prev_order": 65535                                     // Previous order index in linked list (u16, 65535=none) - NEW
   * //       }
   * //     ],
   * //     "total": 12,                                                // Total order count
   * //     "order_type": "down_orders",                                // Order type (string)
   * //     "mint_account": "6ZDJtGFTzrF3FaN5uaqa1h8EexW7BtQd4FwA9Dt7m3ee", // Queried token address
   * //     "page": 1,                                                  // Always 1 (for compatibility)
   * //     "limit": <total>,                                           // Always equals total (for compatibility)
   * //     "has_next": false,                                          // Always false (all data returned)
   * //     "has_prev": false                                           // Always false (all data returned)
   * //   },
   * //   "message": "Operation successful"                             // Operation result message
   * // }
   *
   * // Use utility methods to process data:
   */
  async orders(mint, options = {}) {
    try {
      // Parameter validation
      if (!mint || typeof mint !== 'string') {
        throw new Error('orders: mint address must be a valid string');
      }

      // Set default parameters (kept for compatibility but not used for pagination)
      const orderType = options.type || 'down_orders';
      const page = 1; // Always return page 1

      // Validate order type
      if (!['up_orders', 'down_orders'].includes(orderType)) {
        throw new Error('orders: order type must be "up_orders" or "down_orders"');
      }

      // Convert API type to orderbook direction
      // "up_orders" = short orders = upOrderbook (orderType=2)
      // "down_orders" = long orders = downOrderbook (orderType=1)
      const seed = orderType === 'up_orders' ? 'up_orderbook' : 'down_orderbook';

      // Compute the orderbook PDA locally to avoid calling getCurveAccount (saves 5 RPCs)
      const mintPubkey = new PublicKey(mint);
      const [orderbookPubkey] = PublicKey.findProgramAddressSync(
        [Buffer.from(seed), mintPubkey.toBuffer()],
        this.sdk.programId
      );

      // Get OrderBook account data
      const accountInfo = await this.sdk.connection.getAccountInfo(orderbookPubkey);

      if (!accountInfo) {
        // OrderBook account doesn't exist, return empty result
        return {
          success: true,
          data: {
            orders: [],
            total: 0,
            order_type: orderType,
            mint_account: mint,
            page: page,
            limit: 0,
            has_next: false,
            has_prev: false
          },
          message: "Operation successful"
        };
      }

      const data = accountInfo.data;

      // Parse OrderBook Header
      const header = this._parseOrderBookHeader(data);

      // If no orders in orderbook, return empty result
      if (header.total === 0 || header.head === 65535) {
        return {
          success: true,
          data: {
            orders: [],
            total: 0,
            order_type: orderType,
            mint_account: mint,
            page: page,
            limit: 0,
            has_next: false,
            has_prev: false
          },
          message: "Operation successful"
        };
      }

      // Traverse linked list to read ALL orders
      const orders = [];
      let currentIndex = header.head;

      // Read all orders without limit
      while (currentIndex !== 65535) {
        // Parse order at current index
        const order = this._parseMarginOrder(data, currentIndex, header.headerSize);

        // Data transformation - convert to API format
        const convertedOrder = {
          // Convert chain number to API string format
          order_type: order.orderType === 1 ? 'down_orders' : 'up_orders', // 1=long=down_orders, 2=short=up_orders
          mint: mint, // Use mint from function parameter (not stored in MarginOrder)
          user: order.user.toString(),

          // Price fields (u128 -> string)
          lock_lp_start_price: order.lockLpStartPrice.toString(),
          lock_lp_end_price: order.lockLpEndPrice.toString(),
          open_price: order.openPrice.toString(),

          // Order ID field (u64 -> string)
          order_id: order.orderId.toString(),

          // Amount fields (u64 -> string) - Fix precision issue
          lock_lp_sol_amount: order.lockLpSolAmount.toString(),
          lock_lp_token_amount: order.lockLpTokenAmount.toString(),
          next_lp_sol_amount: order.nextLpSolAmount.toString(),
          next_lp_token_amount: order.nextLpTokenAmount.toString(),

          // Time fields (u32 -> number)
          start_time: order.startTime,
          end_time: order.endTime,

          // Margin and position fields (u64 -> string) - Fix precision issue
          margin_init_sol_amount: order.marginInitSolAmount.toString(),
          margin_sol_amount: order.marginSolAmount.toString(),
          borrow_amount: order.borrowAmount.toString(),
          position_asset_amount: order.positionAssetAmount.toString(),
          realized_sol_amount: order.realizedSolAmount.toString(),

          // Fee field (u16 -> number)
          borrow_fee: order.borrowFee,

          // Order index in OrderBook (uses currentIndex from linked list)
          index: currentIndex,

          // Linked list navigation fields (u16 -> number)
          next_order: order.nextOrder,
          prev_order: order.prevOrder
        };

        orders.push(convertedOrder);

        // Move to next order
        currentIndex = order.nextOrder;
      }

      // Return all orders with pagination-like format for compatibility
      const totalOrders = orders.length;

      return {
        success: true,
        data: {
          orders: orders,
          total: totalOrders,
          order_type: orderType,
          mint_account: mint,
          page: page,
          limit: totalOrders, // limit equals total for compatibility
          has_next: false, // Always false since all data is returned
          has_prev: false  // Always false since all data is returned
        },
        message: "Operation successful"
      };

    } catch (error) {
      // Error handling
      console.error('chain.orders: Failed to get orders', error.message);
      throw new Error(`Failed to get orders: ${error.message}`);
    }
  }

  /**
   * Parse OrderBook Header from account data
   * @private
   * @param {Buffer} data - OrderBook account data
   * @returns {Object} Parsed header object
   */
  _parseOrderBookHeader(data) {
    // Header structure (112 bytes total):
    // discriminator(8) + version(1) + order_type(1) + bump(1) + padding1(5) +
    // authority(32) + order_id_counter(8) + created_at(8) + last_modified(8) +
    // total_capacity(4) + head(2) + tail(2) + total(2) + padding2(2) + reserved(32)

    let offset = 8; // Skip discriminator

    const version = data.readUInt8(offset);
    offset += 1;

    const orderType = data.readUInt8(offset);
    offset += 1;

    const bump = data.readUInt8(offset);
    offset += 1;

    offset += 5; // Skip padding1

    const authority = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const orderIdCounter = data.readBigUInt64LE(offset);
    offset += 8;

    // created_at: i64 (8 bytes) - Unix timestamp in seconds
    const createdAt = Number(data.readBigInt64LE(offset));
    offset += 8;

    // last_modified: i64 (8 bytes) - Unix timestamp in seconds
    const lastModified = Number(data.readBigInt64LE(offset));
    offset += 8;

    const totalCapacity = data.readUInt32LE(offset);
    offset += 4;

    const head = data.readUInt16LE(offset);
    offset += 2;

    const tail = data.readUInt16LE(offset);
    offset += 2;

    const total = data.readUInt16LE(offset);
    offset += 2;

    offset += 2; // Skip padding2
    offset += 32; // Skip reserved

    return {
      version,
      orderType,
      bump,
      authority,
      orderIdCounter,
      createdAt,
      lastModified,
      totalCapacity,
      head,
      tail,
      total,
      headerSize: 112 // Fixed header size (updated for i64 timestamps)
    };
  }

  /**
   * Parse MarginOrder from OrderBook account data
   * @private
   * @param {Buffer} data - OrderBook account data
   * @param {number} index - Order slot index
   * @param {number} headerSize - Header size (112 bytes)
   * @returns {Object} Parsed order object
   */
  _parseMarginOrder(data, index, headerSize) {
    // MarginOrder structure (192 bytes per order):
    // user(32) + lock_lp_start_price(16) + lock_lp_end_price(16) + open_price(16) +
    // order_id(8) + lock_lp_sol_amount(8) + lock_lp_token_amount(8) +
    // next_lp_sol_amount(8) + next_lp_token_amount(8) +
    // margin_init_sol_amount(8) + margin_sol_amount(8) + borrow_amount(8) +
    // position_asset_amount(8) + realized_sol_amount(8) +
    // start_time(8) + end_time(8) + version(4) +
    // next_order(2) + prev_order(2) + borrow_fee(2) +
    // order_type(1) + padding(5)

    const MARGIN_ORDER_SIZE = 192;
    let offset = 8 + headerSize + index * MARGIN_ORDER_SIZE;

    // Boundary check
    if (offset + MARGIN_ORDER_SIZE > data.length) {
      throw new Error(`Order index ${index} exceeds data boundary`);
    }

    // user (32 bytes)
    const user = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    // lock_lp_start_price (u128, 16 bytes)
    const lockLpStartPrice = this._readU128LE(data, offset);
    offset += 16;

    // lock_lp_end_price (u128, 16 bytes)
    const lockLpEndPrice = this._readU128LE(data, offset);
    offset += 16;

    // open_price (u128, 16 bytes)
    const openPrice = this._readU128LE(data, offset);
    offset += 16;

    // order_id (u64, 8 bytes)
    const orderId = data.readBigUInt64LE(offset);
    offset += 8;

    // lock_lp_sol_amount (u64, 8 bytes)
    const lockLpSolAmount = data.readBigUInt64LE(offset);
    offset += 8;

    // lock_lp_token_amount (u64, 8 bytes)
    const lockLpTokenAmount = data.readBigUInt64LE(offset);
    offset += 8;

    // next_lp_sol_amount (u64, 8 bytes)
    const nextLpSolAmount = data.readBigUInt64LE(offset);
    offset += 8;

    // next_lp_token_amount (u64, 8 bytes)
    const nextLpTokenAmount = data.readBigUInt64LE(offset);
    offset += 8;

    // margin_init_sol_amount (u64, 8 bytes)
    const marginInitSolAmount = data.readBigUInt64LE(offset);
    offset += 8;

    // margin_sol_amount (u64, 8 bytes)
    const marginSolAmount = data.readBigUInt64LE(offset);
    offset += 8;

    // borrow_amount (u64, 8 bytes)
    const borrowAmount = data.readBigUInt64LE(offset);
    offset += 8;

    // position_asset_amount (u64, 8 bytes)
    const positionAssetAmount = data.readBigUInt64LE(offset);
    offset += 8;

    // realized_sol_amount (u64, 8 bytes)
    const realizedSolAmount = data.readBigUInt64LE(offset);
    offset += 8;

    // start_time (i64, 8 bytes) - Unix timestamp in seconds
    const startTime = Number(data.readBigInt64LE(offset));
    offset += 8;

    // end_time (i64, 8 bytes) - Unix timestamp in seconds
    const endTime = Number(data.readBigInt64LE(offset));
    offset += 8;

    // version (u32, 4 bytes)
    const version = data.readUInt32LE(offset);
    offset += 4;

    // next_order (u16, 2 bytes)
    const nextOrder = data.readUInt16LE(offset);
    offset += 2;

    // prev_order (u16, 2 bytes)
    const prevOrder = data.readUInt16LE(offset);
    offset += 2;

    // borrow_fee (u16, 2 bytes)
    const borrowFee = data.readUInt16LE(offset);
    offset += 2;

    // order_type (u8, 1 byte)
    const orderType = data.readUInt8(offset);
    offset += 1;

    // Skip padding (5 bytes)
    offset += 5;

    // Note: mint is not stored in MarginOrder structure
    // It should be obtained from context (the mint parameter passed to orders() function)

    return {
      user,
      lockLpStartPrice,
      lockLpEndPrice,
      openPrice,
      orderId,
      lockLpSolAmount,
      lockLpTokenAmount,
      nextLpSolAmount,
      nextLpTokenAmount,
      marginInitSolAmount,
      marginSolAmount,
      borrowAmount,
      positionAssetAmount,
      realizedSolAmount,
      version,
      startTime,
      endTime,
      nextOrder,
      prevOrder,
      borrowFee,
      orderType
    };
  }

  /**
   * Read u128 value (little-endian) from buffer
   * @private
   * @param {Buffer} buffer - Data buffer
   * @param {number} offset - Read offset
   * @returns {bigint} u128 value as BigInt
   */
  _readU128LE(buffer, offset) {
    // Read low 64 bits
    const low = buffer.readBigUInt64LE(offset);
    // Read high 64 bits
    const high = buffer.readBigUInt64LE(offset + 8);
    // Combine into u128
    return (high << 64n) | low;
  }


  /**
   * Debug Orders Data (Read ALL order slots from Chain, ignore linked list structure)
   *
   * This function is designed for debugging corrupted linked list data.
   * It directly reads ALL order slots based on totalCapacity, without following next_order/prev_order.
   * Use this when linked list navigation is broken (corrupted next_order/prev_order values).
   *
   * @param {string} mint - Token mint address
   * @param {Object} options - Query parameters
   * @param {string} options.type - Order type: "up_orders" (short) or "down_orders" (long)
   * @returns {Promise<Object>} Debug order data with ALL order slots (including empty ones)
   *
   * @example
   * // Get all long order slots for debugging (ignores linked list)
   * const debugData = await sdk.chain.debug_orders('6ZDJtGFTzrF3FaN5uaqa1h8EexW7BtQd4FwA9Dt7m3ee', { type: 'down_orders' });
   *
   * // Return format:
   * // {
   * //   "success": true,
   * //   "data": {
   * //     "header": {
   * //       "version": 1,
   * //       "orderType": 1,
   * //       "bump": 253,
   * //       "authority": "7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5",
   * //       "orderIdCounter": "123",
   * //       "createdAt": 1755964862,
   * //       "lastModified": 1756137662,
   * //       "totalCapacity": 100,     // Max order slots
   * //       "head": 0,                // Head index (may be corrupted)
   * //       "tail": 5,                // Tail index (may be corrupted)
   * //       "total": 6,               // Total active orders (may be incorrect)
   * //       "headerSize": 104
   * //     },
   * //     "orders": [
   * //       {
   * //         "slot_index": 0,        // Physical slot index (0 to totalCapacity-1)
   * //         "is_empty": false,      // Whether this slot is empty (all zeros)
   * //         "order_type": "down_orders",
   * //         "mint": "6ZDJtGFTzrF3FaN5uaqa1h8EexW7BtQd4FwA9Dt7m3ee",
   * //         "user": "JD1eNPaJpbtejKfgimbLYLkvpsTHyYzKCCozVLGLS6zu",
   * //         "lock_lp_start_price": "46618228118401293964111",
   * //         "lock_lp_end_price": "45827474968448818396222",
   * //         "open_price": "46222851543425056180166",
   * //         "order_id": "12345",
   * //         "lock_lp_sol_amount": 3299491609,
   * //         "lock_lp_token_amount": 713848715669,
   * //         "next_lp_sol_amount": 3299491609,
   * //         "next_lp_token_amount": 713848715669,
   * //         "start_time": 1756352482,                               // Unix timestamp (i64 as number)
   * //         "end_time": 1756525282,                                 // Unix timestamp (i64 as number)
   * //         "margin_init_sol_amount": 571062973,
   * //         "margin_sol_amount": 571062973,
   * //         "borrow_amount": 3860656108,
   * //         "position_asset_amount": 713848715669,
   * //         "realized_sol_amount": 0,
   * //         "borrow_fee": 300,
   * //         "next_order": 2,        // Next index (may be corrupted)
   * //         "prev_order": 65535     // Prev index (may be corrupted)
   * //       },
   * //       {
   * //         "slot_index": 1,
   * //         "is_empty": true,       // Empty slot (all zeros)
   * //         "order_type": 0,
   * //         "user": "11111111111111111111111111111111",
   * //         ...                     // All fields will be zeros/default values
   * //       },
   * //       ...                       // All slots up to totalCapacity
   * //     ],
   * //     "total_slots": 100,         // Total capacity (all slots)
   * //     "non_empty_slots": 6,       // Count of non-empty slots
   * //     "order_type": "down_orders",
   * //     "mint_account": "6ZDJtGFTzrF3FaN5uaqa1h8EexW7BtQd4FwA9Dt7m3ee"
   * //   },
   * //   "message": "Debug data retrieved (ignores linked list)"
   * // }
   *
   * @note This function is for debugging only. It may return empty slots and ignores linked list navigation.
   * @note Use regular orders() function for production code.
   */
  async debug_orders(mint, options = {}) {
    try {
      // Parameter validation
      if (!mint || typeof mint !== 'string') {
        throw new Error('debug_orders: mint address must be a valid string');
      }

      // Set default parameters
      const orderType = options.type || 'down_orders';

      // Validate order type
      if (!['up_orders', 'down_orders'].includes(orderType)) {
        throw new Error('debug_orders: order type must be "up_orders" or "down_orders"');
      }

      // Compute the orderbook PDA locally to avoid calling getCurveAccount (saves 5 RPCs)
      const seed = orderType === 'up_orders' ? 'up_orderbook' : 'down_orderbook';
      const mintPubkey = new PublicKey(mint);
      const [orderbookPubkey] = PublicKey.findProgramAddressSync(
        [Buffer.from(seed), mintPubkey.toBuffer()],
        this.sdk.programId
      );

      // Get OrderBook account data
      const accountInfo = await this.sdk.connection.getAccountInfo(orderbookPubkey);

      if (!accountInfo) {
        // OrderBook account doesn't exist, return empty result
        return {
          success: true,
          data: {
            header: null,
            orders: [],
            total_slots: 0,
            non_empty_slots: 0,
            order_type: orderType,
            mint_account: mint
          },
          message: "OrderBook account does not exist"
        };
      }

      const data = accountInfo.data;

      // Parse OrderBook Header
      const header = this._parseOrderBookHeader(data);

      // Read ALL order slots based on totalCapacity (ignore linked list)
      const orders = [];
      let nonEmptyCount = 0;

      // Iterate through ALL slots from 0 to totalCapacity-1
      for (let slotIndex = 0; slotIndex < header.totalCapacity; slotIndex++) {
        try {
          // Parse order at this slot
          const order = this._parseMarginOrder(data, slotIndex, header.headerSize);

          // Check if slot is empty (user address is all zeros)
          const isEmpty = order.user.toString() === '11111111111111111111111111111111';

          if (!isEmpty) {
            nonEmptyCount++;
          }

          // Convert to API format
          const convertedOrder = {
            slot_index: slotIndex,              // Physical slot position
            is_empty: isEmpty,                  // Empty slot indicator

            // Order data fields
            order_type: order.orderType === 1 ? 'down_orders' : 'up_orders',
            mint: mint,
            user: order.user.toString(),

            // Price fields (u128 -> string)
            lock_lp_start_price: order.lockLpStartPrice.toString(),
            lock_lp_end_price: order.lockLpEndPrice.toString(),
            open_price: order.openPrice.toString(),

            // Order ID field (u64 -> string)
            order_id: order.orderId.toString(),

            // Amount fields (u64 -> string) - Fix precision issue
            lock_lp_sol_amount: order.lockLpSolAmount.toString(),
            lock_lp_token_amount: order.lockLpTokenAmount.toString(),
            next_lp_sol_amount: order.nextLpSolAmount.toString(),
            next_lp_token_amount: order.nextLpTokenAmount.toString(),

            // Time fields (u32 -> number)
            start_time: order.startTime,
            end_time: order.endTime,

            // Margin and position fields (u64 -> string) - Fix precision issue
            margin_init_sol_amount: order.marginInitSolAmount.toString(),
            margin_sol_amount: order.marginSolAmount.toString(),
            borrow_amount: order.borrowAmount.toString(),
            position_asset_amount: order.positionAssetAmount.toString(),
            realized_sol_amount: order.realizedSolAmount.toString(),

            // Fee field (u16 -> number)
            borrow_fee: order.borrowFee,

            // Linked list navigation (may be corrupted, for debugging)
            next_order: order.nextOrder,
            prev_order: order.prevOrder
          };

          orders.push(convertedOrder);

        } catch (error) {
          // If parsing fails (beyond data boundary), stop iteration
          console.warn(`debug_orders: Failed to parse slot ${slotIndex}: ${error.message}`);
          break;
        }
      }

      // Return debug data
      return {
        success: true,
        data: {
          header: {
            version: header.version,
            orderType: header.orderType,
            bump: header.bump,
            authority: header.authority.toString(),
            orderIdCounter: header.orderIdCounter.toString(),
            createdAt: header.createdAt,
            lastModified: header.lastModified,
            totalCapacity: header.totalCapacity,
            head: header.head,
            tail: header.tail,
            total: header.total,
            headerSize: header.headerSize
          },
          orders: orders,
          total_slots: orders.length,        // Total slots read
          non_empty_slots: nonEmptyCount,    // Non-empty slots count
          order_type: orderType,
          mint_account: mint
        },
        message: "Debug data retrieved (ignores linked list)"
      };

    } catch (error) {
      // Error handling
      console.error('chain.debug_orders: Failed to get debug orders', error.message);
      throw new Error(`Failed to get debug orders: ${error.message}`);
    }
  }

  /**
   * Get User Orders (Read from Chain using new OrderBook structure)
   * Returns ALL user orders regardless of pagination parameters (for compatibility)
   * @param {string} user - User wallet address
   * @param {string} mint - Token mint address
   * @param {Object} options - Query parameters (page and limit are ignored but kept for compatibility)
   * @param {number} options.page - Page number (ignored, always returns all data)
   * @param {number} options.limit - Items per page (ignored, always returns all data)
   * @param {string} options.order_by - Sort order, default 'start_time_desc'
   * @returns {Promise<Object>} User orders data with ALL orders
   *
   * @example
   * const userOrders = await sdk.chain.user_orders(
   *   '8iGFeUkRpyRx8w5uoUMbfZepUr6BfTdPuJmqGoNBntdb',
   *   '4Kq51Kt48FCwdo5CeKjRVPodH1ticHa7mZ5n5gqMEy1X',
   *   { order_by: 'start_time_desc' }
   * );
   * // Return format:
   * // {
   * //   "success": true,
   * //   "data": {
   * //     "orders": [
   * //       {
   * //         "order_type": 2,                                          // Order type: 1=long, 2=short
   * //         "mint": "4Kq51Kt48FCwdo5CeKjRVPodH1ticHa7mZ5n5gqMEy1X",   // Token address
   * //         "user": "8iGFeUkRpyRx8w5uoUMbfZepUr6BfTdPuJmqGoNBntdb",     // User address
   * //         "lock_lp_start_price": "753522984132656210522",            // LP start price
   * //         "lock_lp_end_price": "833102733432007194898",              // LP end price
   * //         "open_price": "793312858782331702710",                     // Open price - NEW
   * //         "order_id": "12345",                                       // Order ID (u64 as string) - NEW
   * //         "lock_lp_sol_amount": 2535405978,                          // LP locked SOL
   * //         "lock_lp_token_amount": 32000000000000,                    // LP locked token
   * //         "next_lp_sol_amount": 2535405978,                          // Next LP SOL - NEW
   * //         "next_lp_token_amount": 32000000000000,                    // Next LP token - NEW
   * //         "start_time": 1755964862,                                  // Start timestamp (i64 as number)
   * //         "end_time": 1756137662,                                    // End timestamp (i64 as number)
   * //         "margin_init_sol_amount": 1909140052,                      // Initial margin - NEW
   * //         "margin_sol_amount": 1909140052,                           // Current margin
   * //         "borrow_amount": 32000000000000,                           // Borrow amount
   * //         "position_asset_amount": 656690798,                        // Position asset
   * //         "realized_sol_amount": 0,                                  // Realized SOL - NEW
   * //         "borrow_fee": 1200,                                        // Borrow fee (bps)
   * //         "index": 0,                                                // Order index in OrderBook (currentIndex)
   * //         "next_order": 2,                                           // Next order index in linked list (u16, 65535=none) - NEW
   * //         "prev_order": 65535                                        // Previous order index in linked list (u16, 65535=none) - NEW
   * //       }
   * //     ],
   * //     "total": 11,                                                   // Total order count
   * //     "user": "8iGFeUkRpyRx8w5uoUMbfZepUr6BfTdPuJmqGoNBntdb",        // User address
   * //     "mint_account": "4Kq51Kt48FCwdo5CeKjRVPodH1ticHa7mZ5n5gqMEy1X", // Token address
   * //     "page": 1,                                                     // Always 1 (for compatibility)
   * //     "limit": <total>,                                              // Always equals total (for compatibility)
   * //     "has_next": false,                                             // Always false (all data returned)
   * //     "has_prev": false                                              // Always false (all data returned)
   * //   },
   * //   "message": "Operation successful"
   * // }
   *
   * // Use order data:
   * const orders = userOrders.data.orders; // Order array
   * const totalCount = userOrders.data.total; // Total count
   */
  async user_orders(user, mint, options = {}) {
    try {
      // Parameter validation
      if (!user || typeof user !== 'string') {
        throw new Error('user_orders: user address must be a valid string');
      }
      if (!mint || typeof mint !== 'string') {
        throw new Error('user_orders: mint address must be a valid string');
      }

      // Set default parameters (kept for compatibility)
      const page = 1; // Always return page 1
      const orderBy = options.order_by || 'start_time_desc';

      // Compute the orderbook PDA locally to avoid calling getCurveAccount (saves 5 RPCs)
      const mintPubkey = new PublicKey(mint);
      const [upOrderbookPubkey] = PublicKey.findProgramAddressSync(
        [Buffer.from('up_orderbook'), mintPubkey.toBuffer()],
        this.sdk.programId
      );
      const [downOrderbookPubkey] = PublicKey.findProgramAddressSync(
        [Buffer.from('down_orderbook'), mintPubkey.toBuffer()],
        this.sdk.programId
      );
      const upOrderbookAddress = upOrderbookPubkey.toString();   // Short orders (orderType=2)
      const downOrderbookAddress = downOrderbookPubkey.toString(); // Long orders (orderType=1)

      // Collect all user orders from both OrderBooks
      const allUserOrders = [];

      // Helper function to traverse an OrderBook and collect user orders
      const traverseOrderBook = async (orderbookAddress) => {
        if (!orderbookAddress) return [];

        const orders = [];

        // Get OrderBook account data
        const orderbookPubkey = new PublicKey(orderbookAddress);
        const accountInfo = await this.sdk.connection.getAccountInfo(orderbookPubkey);

        if (!accountInfo) {
          return []; // OrderBook doesn't exist
        }

        const data = accountInfo.data;

        // Parse OrderBook Header
        const header = this._parseOrderBookHeader(data);

        // If no orders in orderbook, return empty
        if (header.total === 0 || header.head === 65535) {
          return [];
        }

        // Traverse linked list to find ALL user orders
        let currentIndex = header.head;

        while (currentIndex !== 65535) {
          try {
            // Parse order at current index
            const order = this._parseMarginOrder(data, currentIndex, header.headerSize);

            // Check if this order belongs to the target user
            if (order.user.toString() === user) {
              // Data transformation - convert to API format
              const convertedOrder = {
                // Keep as number for compatibility (1=long, 2=short)
                order_type: order.orderType,
                mint: mint, // Use mint from function parameter
                user: order.user.toString(),

                // Price fields (u128 -> string)
                lock_lp_start_price: order.lockLpStartPrice.toString(),
                lock_lp_end_price: order.lockLpEndPrice.toString(),
                open_price: order.openPrice.toString(),

                // Order ID field (u64 -> string)
                order_id: order.orderId.toString(),

                // Amount fields (u64 -> string) - Fix precision issue
                lock_lp_sol_amount: order.lockLpSolAmount.toString(),
                lock_lp_token_amount: order.lockLpTokenAmount.toString(),
                next_lp_sol_amount: order.nextLpSolAmount.toString(),
                next_lp_token_amount: order.nextLpTokenAmount.toString(),

                // Time fields (u32 -> number)
                start_time: order.startTime,
                end_time: order.endTime,

                // Margin and position fields (u64 -> string) - Fix precision issue
                margin_init_sol_amount: order.marginInitSolAmount.toString(),
                margin_sol_amount: order.marginSolAmount.toString(),
                borrow_amount: order.borrowAmount.toString(),
                position_asset_amount: order.positionAssetAmount.toString(),
                realized_sol_amount: order.realizedSolAmount.toString(),

                // Fee field (u16 -> number)
                borrow_fee: order.borrowFee,

                // Order index in OrderBook (uses currentIndex from linked list)
                index: currentIndex,

                // Linked list navigation fields (u16 -> number)
                next_order: order.nextOrder,
                prev_order: order.prevOrder
              };

              orders.push(convertedOrder);
            }

            // Move to next order
            currentIndex = order.nextOrder;

          } catch (error) {
            console.warn(`user_orders: Error parsing order at index ${currentIndex}: ${error.message}`);
            break;
          }
        }

        return orders;
      };

      // Traverse both OrderBooks in parallel to find user orders
      const [upOrders, downOrders] = await Promise.all([
        traverseOrderBook(upOrderbookAddress),
        traverseOrderBook(downOrderbookAddress)
      ]);

      // Combine all orders
      allUserOrders.push(...upOrders, ...downOrders);

      // Sort orders by start_time
      if (orderBy === 'start_time_desc') {
        allUserOrders.sort((a, b) => b.start_time - a.start_time);
      } else if (orderBy === 'start_time_asc') {
        allUserOrders.sort((a, b) => a.start_time - b.start_time);
      }

      // Return all orders with pagination-like format for compatibility
      const totalOrders = allUserOrders.length;

      return {
        success: true,
        data: {
          orders: allUserOrders,
          total: totalOrders,
          user: user,
          mint_account: mint,
          page: page,
          limit: totalOrders, // limit equals total for compatibility
          has_next: false, // Always false since all data is returned
          has_prev: false  // Always false since all data is returned
        },
        message: "Operation successful"
      };

    } catch (error) {
      // Error handling
      console.error('chain.user_orders: Failed to get user orders', error.message);
      throw new Error(`Failed to get user orders: ${error.message}`);
    }
  }
}

module.exports = ChainModule;