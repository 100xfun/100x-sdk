const { ComputeBudgetProgram, PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY } = require('@solana/web3.js');
const { createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const anchor = require('@coral-xyz/anchor');
// Use the buffer package uniformly, consistent across all platforms
const { Buffer } = require('buffer');
const { MAX_CANDIDATE_INDICES } = require('./simulator/utils');

// Environment detection and conditional loading
const IS_NODE = typeof process !== 'undefined' && process.versions && process.versions.node;

/**
 * Trading Module
 * Handles buy/sell and long/short trading operations
 */
class TradingModule {
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Buy tokens
   * @param {Object} params - Buy parameters
   * @param {string|PublicKey} params.mintAccount - Token mint account address
   * @param {anchor.BN} params.buyTokenAmount - Amount of tokens to buy
   * @param {anchor.BN} params.maxSolAmount - Maximum SOL to spend
   * @param {PublicKey} params.payer - Payer public key
   * @param {Object} options - Optional parameters
   * @param {number} options.computeUnits - Compute units limit, default 1400000
   * @returns {Promise<Object>} Object containing transaction, signers and account info
   *
   * @example
   * const result = await sdk.trading.buy({
   *   mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
   *   buyTokenAmount: new anchor.BN("1000000000"),
   *   maxSolAmount: new anchor.BN("2000000000"),
   *   payer: wallet.publicKey
   * });
   */
  async buy({ mintAccount, buyTokenAmount, maxSolAmount, payer }, options = {}) {
    const { computeUnits = 1400000 } = options;

    // 1. Parameter validation and conversion
    const mint = typeof mintAccount === 'string' ? new PublicKey(mintAccount) : mintAccount;

    if (!anchor.BN.isBN(buyTokenAmount) || !anchor.BN.isBN(maxSolAmount)) {
      throw new Error('buyTokenAmount and maxSolAmount must be anchor.BN type');
    }

    // 2. Calculate PDA accounts
    const accounts = this._calculatePDAAccounts(mint);

    // 3. Calculate orderbook PDAs
    const [upOrderbook] = PublicKey.findProgramAddressSync(
      [Buffer.from('up_orderbook'), mint.toBuffer()],
      this.sdk.programId
    );

    const [downOrderbook] = PublicKey.findProgramAddressSync(
      [Buffer.from('down_orderbook'), mint.toBuffer()],
      this.sdk.programId
    );

    // 4. Get user token account
    const userTokenAccount = await getAssociatedTokenAddress(
      mint,
      payer
    );

    // 5. Check if user token account exists, create if not
    const userTokenAccountInfo = await this.sdk.connection.getAccountInfo(userTokenAccount);
    const createAtaIx = userTokenAccountInfo === null
      ? createAssociatedTokenAccountInstruction(
        payer,
        userTokenAccount,
        payer,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
      : null;

    // 6. Get fee recipient accounts from curve account (skipBalances: only need addresses)
    const curveAccountInfo = await this.sdk.chain.getCurveAccount(mint, { skipBalances: true });
    const feeRecipientAccount = new PublicKey(curveAccountInfo.feeRecipient);
    const baseFeeRecipientAccount = new PublicKey(curveAccountInfo.baseFeeRecipient);

    // 6.5. Calculate cooldown PDA
    const [cooldownPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('trade_cooldown'),
        mint.toBuffer(),
        payer.toBuffer()
      ],
      this.sdk.programId
    );

    // 7. Build transaction instructions
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits
    });

    const buyIx = await this.sdk.program.methods
      .buy(buyTokenAmount, maxSolAmount)
      .accounts({
        payer: payer,
        mintAccount: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolBorrowTokenAccount: accounts.poolBorrowTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        upOrderbook: upOrderbook,
        downOrderbook: downOrderbook,
        userTokenAccount: userTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        feeRecipientAccount: feeRecipientAccount,
        baseFeeRecipientAccount: baseFeeRecipientAccount,
        cooldown: cooldownPDA
      })
      .instruction();

    // 8. Create transaction and add instructions
    const transaction = new Transaction();
    transaction.add(modifyComputeUnits);

    // If user token account doesn't exist, create it first
    if (createAtaIx) {
      transaction.add(createAtaIx);
    }

    transaction.add(buyIx);

    // 9. Return transaction object and related info
    return {
      transaction,
      signers: [], // Buy transaction doesn't need additional signers, only payer signature
      accounts: {
        mint: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        upOrderbook: upOrderbook,
        downOrderbook: downOrderbook,
        userTokenAccount: userTokenAccount,
        payer: payer,
        feeRecipientAccount: feeRecipientAccount,
        baseFeeRecipientAccount: baseFeeRecipientAccount,
        cooldown: cooldownPDA
      }
    };
  }

  /**

  /**
   * Sell tokens
   * @param {Object} params - Sell parameters
   * @param {string|PublicKey} params.mintAccount - Token mint account address
   * @param {anchor.BN} params.sellTokenAmount - Amount of tokens to sell
   * @param {anchor.BN} params.minSolOutput - Minimum SOL output
   * @param {PublicKey} params.payer - Payer public key
   * @param {Object} options - Optional parameters
   * @param {number} options.computeUnits - Compute units limit, default 1400000
   * @returns {Promise<Object>} Object containing transaction, signers and account info
   * 
   * @example
   * const result = await sdk.trading.sell({
   *   mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
   *   sellTokenAmount: new anchor.BN("1000000000"),
   *   minSolOutput: new anchor.BN("2000000000"),
   *   payer: wallet.publicKey
   * });
   */
  async sell({ mintAccount, sellTokenAmount, minSolOutput, payer }, options = {}) {
    const { computeUnits = 1400000 } = options;

    // 1. Parameter validation and conversion
    const mint = typeof mintAccount === 'string' ? new PublicKey(mintAccount) : mintAccount;

    if (!anchor.BN.isBN(sellTokenAmount) || !anchor.BN.isBN(minSolOutput)) {
      throw new Error('sellTokenAmount and minSolOutput must be anchor.BN type');
    }

    // 2. Calculate PDA accounts
    const accounts = this._calculatePDAAccounts(mint);

    // 3. Calculate orderbook PDAs
    const [upOrderbook] = PublicKey.findProgramAddressSync(
      [Buffer.from('up_orderbook'), mint.toBuffer()],
      this.sdk.programId
    );

    const [downOrderbook] = PublicKey.findProgramAddressSync(
      [Buffer.from('down_orderbook'), mint.toBuffer()],
      this.sdk.programId
    );

    // 4. Get user token account
    const userTokenAccount = await getAssociatedTokenAddress(
      mint,
      payer
    );

    // 5. Check if user token account exists, create if not
    const userTokenAccountInfo = await this.sdk.connection.getAccountInfo(userTokenAccount);
    const createAtaIx = userTokenAccountInfo === null
      ? createAssociatedTokenAccountInstruction(
        payer,
        userTokenAccount,
        payer,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
      : null;

    // 6. Get fee recipient accounts from curve account (skipBalances: only need addresses)
    const curveAccountInfo = await this.sdk.chain.getCurveAccount(mint, { skipBalances: true });
    const feeRecipientAccount = new PublicKey(curveAccountInfo.feeRecipient);
    const baseFeeRecipientAccount = new PublicKey(curveAccountInfo.baseFeeRecipient);

    // 6.5. Calculate cooldown PDA
    const [cooldownPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('trade_cooldown'),
        mint.toBuffer(),
        payer.toBuffer()
      ],
      this.sdk.programId
    );

    // 7. Build transaction instructions
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits
    });

    const sellIx = await this.sdk.program.methods
      .sell(sellTokenAmount, minSolOutput)
      .accounts({
        payer: payer,
        mintAccount: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolBorrowTokenAccount: accounts.poolBorrowTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        upOrderbook: upOrderbook,
        downOrderbook: downOrderbook,
        userTokenAccount: userTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        feeRecipientAccount: feeRecipientAccount,
        baseFeeRecipientAccount: baseFeeRecipientAccount,
        cooldown: cooldownPDA
      })
      .instruction();

    // 8. Create transaction and add instructions
    const transaction = new Transaction();
    transaction.add(modifyComputeUnits);

    // If user token account doesn't exist, create it first
    if (createAtaIx) {
      transaction.add(createAtaIx);
    }

    transaction.add(sellIx);

    // 9. Return transaction object and related info
    return {
      transaction,
      signers: [], // Sell transaction doesn't need additional signers, only payer signature
      accounts: {
        mint: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        upOrderbook: upOrderbook,
        downOrderbook: downOrderbook,
        userTokenAccount: userTokenAccount,
        payer: payer,
        feeRecipientAccount: feeRecipientAccount,
        baseFeeRecipientAccount: baseFeeRecipientAccount,
        cooldown: cooldownPDA
      }
    };
  }

  /**
   * Margin Long
   * @param {Object} params - Long parameters
   * @param {string|PublicKey} params.mintAccount - Token mint account address
   * @param {anchor.BN} params.buyTokenAmount - Amount of tokens to buy (fixed value)
   * @param {anchor.BN} params.maxSolAmount - Maximum SOL to spend (the actual amount may be slightly less)
   * @param {anchor.BN} params.marginSol - Margin amount (margin in SOL)
   * @param {anchor.BN} params.closePrice - Close price (close price / stop loss price)
   * @param {Array<number>} params.closeInsertIndices - Close insert indices array (position indices for inserting into the orderbook at close)
   * @param {PublicKey} params.payer - Payer public key
   * @param {Object} options - Optional parameters
   * @param {number} options.computeUnits - Compute units limit, default 1400000
   * @returns {Promise<Object>} Object containing transaction, signers and account info
   *
   * @example
   * const result = await sdk.trading.long({
   *   mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
   *   buyTokenAmount: new anchor.BN("10000000"),
   *   maxSolAmount: new anchor.BN("1100000000"),
   *   marginSol: new anchor.BN("2200000000"),
   *   closePrice: new anchor.BN("1000000000000000"),
   *   closeInsertIndices: [0, 1, 2], // insert position index array
   *   payer: wallet.publicKey
   * });
   */
  async long({ mintAccount, buyTokenAmount, maxSolAmount, marginSol, closePrice, closeInsertIndices, payer }, options = {}) {
    const { computeUnits = 1400000 } = options;

    // 1. Parameter validation and conversion
    const mint = typeof mintAccount === 'string' ? new PublicKey(mintAccount) : mintAccount;

    if (!anchor.BN.isBN(buyTokenAmount) || !anchor.BN.isBN(maxSolAmount) ||
      !anchor.BN.isBN(marginSol) || !anchor.BN.isBN(closePrice)) {
      throw new Error('All amount parameters must be anchor.BN type');
    }

    if (!Array.isArray(closeInsertIndices) || closeInsertIndices.length === 0) {
      throw new Error('closeInsertIndices must be a non-empty array');
    }

    if (closeInsertIndices.length > 20) {
      throw new Error('closeInsertIndices array cannot exceed 20 elements');
    }

    // 2. Calculate PDA accounts
    const accounts = this._calculatePDAAccounts(mint);

    // 3. Calculate OrderBook PDA addresses
    const [upOrderbook] = PublicKey.findProgramAddressSync(
      [Buffer.from("up_orderbook"), mint.toBuffer()],
      this.sdk.programId
    );

    const [downOrderbook] = PublicKey.findProgramAddressSync(
      [Buffer.from("down_orderbook"), mint.toBuffer()],
      this.sdk.programId
    );

    // 4. Build transaction instructions
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits
    });

    const longIx = await this.sdk.program.methods
      .long(
        buyTokenAmount,
        maxSolAmount,
        marginSol,
        closePrice,
        closeInsertIndices
      )
      .accounts({
        payer: payer,
        mintAccount: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolBorrowTokenAccount: accounts.poolBorrowTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        feeRecipientAccount: this.sdk.feeRecipient,
        baseFeeRecipientAccount: this.sdk.baseFeeRecipient,
        upOrderbook: upOrderbook,
        downOrderbook: downOrderbook
      })
      .instruction();

    // 5. Create transaction and add instructions
    const transaction = new Transaction();
    transaction.add(modifyComputeUnits);
    transaction.add(longIx);

    // 6. Return transaction object and related info
    return {
      transaction,
      signers: [], // Long transaction doesn't need additional signers, only payer signature
      accounts: {
        mint: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        payer: payer,
        upOrderbook: upOrderbook,
        downOrderbook: downOrderbook
      },
      orderData: {
        closeInsertIndices: closeInsertIndices
      }
    };
  }

  /**
   * Margin Short
   * @param {Object} params - Short parameters
   * @param {string|PublicKey} params.mintAccount - Token mint account address
   * @param {anchor.BN} params.borrowSellTokenAmount - Borrowed token amount to sell (the amount of tokens you wish to sell)
   * @param {anchor.BN} params.minSolOutput - Minimum SOL output (the minimum SOL received after selling)
   * @param {anchor.BN} params.marginSol - Margin amount (SOL)
   * @param {anchor.BN} params.closePrice - Close price (stop loss price)
   * @param {Array<number>} params.closeInsertIndices - Close insert indices array (position indices for inserting into the orderbook at close)
   * @param {PublicKey} params.payer - Payer public key
   * @param {Object} options - Optional parameters
   * @param {number} options.computeUnits - Compute units limit, default 1400000
   * @returns {Promise<Object>} Object containing transaction, signers and account info
   *
   * @example
   * const result = await sdk.trading.short({
   *   mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
   *   borrowSellTokenAmount: new anchor.BN("1000000000"),
   *   minSolOutput: new anchor.BN("100"),
   *   marginSol: new anchor.BN("2200000000"),
   *   closePrice: new anchor.BN("1000000000000000"),
   *   closeInsertIndices: [0, 1, 2], // insert position index array
   *   payer: wallet.publicKey
   * });
   */
  async short({ mintAccount, borrowSellTokenAmount, minSolOutput, marginSol, closePrice, closeInsertIndices, payer }, options = {}) {
    const { computeUnits = 1400000 } = options;

    // 1. Parameter validation and conversion
    const mint = typeof mintAccount === 'string' ? new PublicKey(mintAccount) : mintAccount;

    if (!anchor.BN.isBN(borrowSellTokenAmount) || !anchor.BN.isBN(minSolOutput) ||
      !anchor.BN.isBN(marginSol) || !anchor.BN.isBN(closePrice)) {
      throw new Error('所有金额参数必须是 anchor.BN 类型 / All amount parameters must be anchor.BN type');
    }

    if (!Array.isArray(closeInsertIndices) || closeInsertIndices.length === 0) {
      throw new Error('closeInsertIndices must be a non-empty array');
    }

    if (closeInsertIndices.length > 20) {
      throw new Error('closeInsertIndices array cannot exceed 20 elements');
    }

    // 2. Calculate PDA accounts
    const accounts = this._calculatePDAAccounts(mint);

    // 3. Calculate OrderBook PDA addresses
    const [upOrderbook] = PublicKey.findProgramAddressSync(
      [Buffer.from("up_orderbook"), mint.toBuffer()],
      this.sdk.programId
    );

    const [downOrderbook] = PublicKey.findProgramAddressSync(
      [Buffer.from("down_orderbook"), mint.toBuffer()],
      this.sdk.programId
    );

    // 4. Build transaction instructions
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits
    });

    const shortIx = await this.sdk.program.methods
      .short(
        borrowSellTokenAmount,
        minSolOutput,
        marginSol,
        closePrice,
        closeInsertIndices
      )
      .accounts({
        payer: payer,
        mintAccount: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolBorrowTokenAccount: accounts.poolBorrowTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        feeRecipientAccount: this.sdk.feeRecipient,
        baseFeeRecipientAccount: this.sdk.baseFeeRecipient,
        upOrderbook: upOrderbook,
        downOrderbook: downOrderbook
      })
      .instruction();

    // 5. Create transaction and add instructions
    const transaction = new Transaction();
    transaction.add(modifyComputeUnits);
    transaction.add(shortIx);

    // 6. Return transaction object and related info
    return {
      transaction,
      signers: [], // Short transaction doesn't need additional signers, only payer signature
      accounts: {
        mint: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        payer: payer,
        upOrderbook: upOrderbook,
        downOrderbook: downOrderbook
      },
      orderData: {
        closeInsertIndices: closeInsertIndices
      }
    };
  }

  /**
   * Close Long Position
   * @param {Object} params - Close position parameters
   * @param {string|PublicKey} params.mintAccount - Token mint account address
   * @param {anchor.BN} params.sellTokenAmount - Amount of tokens to sell
   * @param {anchor.BN} params.minSolOutput - Minimum SOL output after selling
   * @param {number|anchor.BN} params.closeOrderId - Order unique ID
   * @param {Array<number>} params.closeOrderIndices - Close order position indices array
   * @param {PublicKey} params.payer - Payer public key
   * @param {PublicKey} params.userSolAccount - User SOL account to receive funds (must be order opener)
   * @param {Object} options - Optional parameters
   * @param {number} options.computeUnits - Compute units limit, default 1400000
   * @returns {Promise<Object>} Object containing transaction, signers and account info
   *
   * @example
   * const result = await sdk.trading.closeLong({
   *   mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
   *   sellTokenAmount: new anchor.BN("1000000000"),
   *   minSolOutput: new anchor.BN("100000000"),
   *   closeOrderId: 12345,  // order unique ID
   *   closeOrderIndices: [10, 11, 12],  // candidate index array
   *   payer: wallet.publicKey,
   *   userSolAccount: orderOwnerPublicKey
   * });
   */
  async closeLong({ mintAccount, sellTokenAmount, minSolOutput, closeOrderId, closeOrderIndices, payer, userSolAccount }, options = {}) {
    const { computeUnits = 1400000 } = options;

    // 1. Parameter validation and conversion
    const mint = typeof mintAccount === 'string' ? new PublicKey(mintAccount) : mintAccount;

    if (!anchor.BN.isBN(sellTokenAmount) || !anchor.BN.isBN(minSolOutput)) {
      throw new Error('sellTokenAmount and minSolOutput must be anchor.BN type');
    }

    // Convert closeOrderId to anchor.BN (u64)
    const closeOrderIdBN = anchor.BN.isBN(closeOrderId) ? closeOrderId : new anchor.BN(closeOrderId);

    // Validate the closeOrderIndices parameter
    if (!Array.isArray(closeOrderIndices) || closeOrderIndices.length === 0) {
      throw new Error('closeOrderIndices must be a non-empty array');
    }

    if (closeOrderIndices.length > MAX_CANDIDATE_INDICES) {
      throw new Error(`closeOrderIndices array cannot exceed ${MAX_CANDIDATE_INDICES} elements`);
    }

    // Validate and convert userSolAccount - supports string or PublicKey object
    let userSolAccountPubkey;
    if (!userSolAccount) {
      throw new Error('userSolAccount is required');
    }

    if (typeof userSolAccount === 'string') {
      try {
        userSolAccountPubkey = new PublicKey(userSolAccount);
      } catch (error) {
        throw new Error('userSolAccount must be a valid PublicKey string');
      }
    } else if (userSolAccount instanceof PublicKey) {
      userSolAccountPubkey = userSolAccount;
    } else if (userSolAccount.constructor && userSolAccount.constructor.name === 'PublicKey') {
      // Handle cross-package PublicKey instances - extract the string and recreate
      try {
        userSolAccountPubkey = new PublicKey(userSolAccount.toString());
      } catch (error) {
        throw new Error('userSolAccount must be a valid PublicKey');
      }
    } else {
      throw new Error('userSolAccount must be a valid PublicKey or PublicKey string');
    }

    // 2. Calculate PDA accounts
    const accounts = this._calculatePDAAccounts(mint);

    // 3. Calculate OrderBook PDA addresses
    const [upOrderbook] = PublicKey.findProgramAddressSync(
      [Buffer.from('up_orderbook'), mint.toBuffer()],
      this.sdk.programId
    );

    const [downOrderbook] = PublicKey.findProgramAddressSync(
      [Buffer.from('down_orderbook'), mint.toBuffer()],
      this.sdk.programId
    );

    // 4. Get fee recipient accounts from curve account (skipBalances: only need addresses)
    const curveAccountInfo = await this.sdk.chain.getCurveAccount(mint, { skipBalances: true });
    const feeRecipientAccount = new PublicKey(curveAccountInfo.feeRecipient);
    const baseFeeRecipientAccount = new PublicKey(curveAccountInfo.baseFeeRecipient);

    // 5. Build transaction instructions
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits
    });

    const closeLongIx = await this.sdk.program.methods
      .closeLong(
        sellTokenAmount,       // sell_token_amount: amount of tokens to sell
        minSolOutput,          // min_sol_output: minimum SOL output
        closeOrderIdBN,        // close_order_id: order unique ID
        closeOrderIndices      // close_order_indices: close order indices array
      )
      .accounts({
        payer: payer,
        mintAccount: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolBorrowTokenAccount: accounts.poolBorrowTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        userSolAccount: userSolAccountPubkey,  // User SOL account (must be order opener)
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        feeRecipientAccount: feeRecipientAccount,
        baseFeeRecipientAccount: baseFeeRecipientAccount,
        upOrderbook: upOrderbook,
        downOrderbook: downOrderbook
      })
      .instruction();

    // 6. Create transaction and add instructions
    const transaction = new Transaction();
    transaction.add(modifyComputeUnits);
    transaction.add(closeLongIx);

    // 7. Return transaction object and related info
    return {
      transaction,
      signers: [], // Close long transaction doesn't need additional signers, only payer signature
      accounts: {
        mint: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        payer: payer,
        userSolAccount: userSolAccount,
        upOrderbook: upOrderbook,
        downOrderbook: downOrderbook,
        feeRecipientAccount: feeRecipientAccount,
        baseFeeRecipientAccount: baseFeeRecipientAccount
      },
      orderData: {
        closeOrderId: closeOrderIdBN.toString(),
        closeOrderIndices: closeOrderIndices
      }
    };
  }


  /**
   * Close Short Position
   * @param {Object} params - Close position parameters
   * @param {string|PublicKey} params.mintAccount - Token mint account address
   * @param {anchor.BN} params.buyTokenAmount - Amount of tokens to buy
   * @param {anchor.BN} params.maxSolAmount - Maximum SOL amount to spend
   * @param {number|anchor.BN} params.closeOrderId - Order unique ID
   * @param {Array<number>} params.closeOrderIndices - Close order position indices array
   * @param {PublicKey} params.payer - Payer public key
   * @param {PublicKey} params.userSolAccount - User SOL account to receive funds (must be order opener)
   * @param {Object} options - Optional parameters
   * @param {number} options.computeUnits - Compute units limit, default 1400000
   * @returns {Promise<Object>} Object containing transaction, signers and account info
   *
   * @example
   * const result = await sdk.trading.closeShort({
   *   mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
   *   buyTokenAmount: new anchor.BN("1000000000"),
   *   maxSolAmount: new anchor.BN("100000000"),
   *   closeOrderId: 12345,  // order unique ID
   *   closeOrderIndices: [10, 11, 12],  // candidate index array
   *   payer: wallet.publicKey,
   *   userSolAccount: orderOwnerPublicKey
   * });
   */
  async closeShort({ mintAccount, buyTokenAmount, maxSolAmount, closeOrderId, closeOrderIndices, payer, userSolAccount }, options = {}) {
    const { computeUnits = 1400000 } = options;

    // 1. Parameter validation and conversion
    const mint = typeof mintAccount === 'string' ? new PublicKey(mintAccount) : mintAccount;

    if (!anchor.BN.isBN(buyTokenAmount) || !anchor.BN.isBN(maxSolAmount)) {
      throw new Error('buyTokenAmount and maxSolAmount must be anchor.BN type');
    }

    // Convert closeOrderId to anchor.BN (u64)
    const closeOrderIdBN = anchor.BN.isBN(closeOrderId) ? closeOrderId : new anchor.BN(closeOrderId);

    // Validate the closeOrderIndices parameter
    if (!Array.isArray(closeOrderIndices) || closeOrderIndices.length === 0) {
      throw new Error('closeOrderIndices must be a non-empty array');
    }

    if (closeOrderIndices.length > MAX_CANDIDATE_INDICES) {
      throw new Error(`closeOrderIndices array cannot exceed ${MAX_CANDIDATE_INDICES} elements`);
    }

    // Validate and convert userSolAccount - supports string or PublicKey object
    let userSolAccountPubkey;
    if (!userSolAccount) {
      throw new Error('userSolAccount is required');
    }

    if (typeof userSolAccount === 'string') {
      try {
        userSolAccountPubkey = new PublicKey(userSolAccount);
      } catch (error) {
        throw new Error('userSolAccount must be a valid PublicKey string');
      }
    } else if (userSolAccount instanceof PublicKey) {
      userSolAccountPubkey = userSolAccount;
    } else if (userSolAccount.constructor && userSolAccount.constructor.name === 'PublicKey') {
      // Handle cross-package PublicKey instances - extract the string and recreate
      try {
        userSolAccountPubkey = new PublicKey(userSolAccount.toString());
      } catch (error) {
        throw new Error('userSolAccount must be a valid PublicKey');
      }
    } else {
      throw new Error('userSolAccount must be a valid PublicKey or PublicKey string');
    }

    // 2. Calculate PDA accounts
    const accounts = this._calculatePDAAccounts(mint);

    // 3. Calculate OrderBook PDA addresses
    const [upOrderbook] = PublicKey.findProgramAddressSync(
      [Buffer.from('up_orderbook'), mint.toBuffer()],
      this.sdk.programId
    );

    const [downOrderbook] = PublicKey.findProgramAddressSync(
      [Buffer.from('down_orderbook'), mint.toBuffer()],
      this.sdk.programId
    );

    // 4. Get fee recipient accounts from curve account (skipBalances: only need addresses)
    const curveAccountInfo = await this.sdk.chain.getCurveAccount(mint, { skipBalances: true });
    const feeRecipientAccount = new PublicKey(curveAccountInfo.feeRecipient);
    const baseFeeRecipientAccount = new PublicKey(curveAccountInfo.baseFeeRecipient);

    // 5. Build transaction instructions
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits
    });

    const closeShortIx = await this.sdk.program.methods
      .closeShort(
        buyTokenAmount,        // buy_token_amount: amount of tokens to buy
        maxSolAmount,          // max_sol_amount: maximum SOL amount to spend
        closeOrderIdBN,        // close_order_id: order unique ID
        closeOrderIndices      // close_order_indices: close order indices array
      )
      .accounts({
        payer: payer,
        mintAccount: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolBorrowTokenAccount: accounts.poolBorrowTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        userSolAccount: userSolAccountPubkey,  // User SOL account (must be order opener)
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        feeRecipientAccount: feeRecipientAccount,
        baseFeeRecipientAccount: baseFeeRecipientAccount,
        upOrderbook: upOrderbook,
        downOrderbook: downOrderbook
      })
      .instruction();

    // 6. Create transaction and add instructions
    const transaction = new Transaction();
    transaction.add(modifyComputeUnits);
    transaction.add(closeShortIx);

    // 7. Return transaction object and related info
    return {
      transaction,
      signers: [], // Close short transaction doesn't need additional signers, only payer signature
      accounts: {
        mint: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        payer: payer,
        userSolAccount: userSolAccount,
        upOrderbook: upOrderbook,
        downOrderbook: downOrderbook,
        feeRecipientAccount: feeRecipientAccount,
        baseFeeRecipientAccount: baseFeeRecipientAccount
      },
      orderData: {
        closeOrderId: closeOrderIdBN.toString(),
        closeOrderIndices: closeOrderIndices
      }
    };
  }

  // ========== PDA Calculation Methods ==========

  /**
   * Calculate PDA accounts
   * @private
   * @param {PublicKey} mintAccount - Token mint account
   * @returns {Object} PDA accounts object
   */
  _calculatePDAAccounts(mintAccount) {
    // Calculate the curve account PDA
    const [curveAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('borrowing_curve'), mintAccount.toBuffer()],
      this.sdk.programId
    );

    // Calculate the pool token account PDA
    const [poolTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool_token'), mintAccount.toBuffer()],
      this.sdk.programId
    );

    // Calculate the borrow-pool-specific token account PDA
    const [poolBorrowTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool_borrow_token'), mintAccount.toBuffer()],
      this.sdk.programId
    );

    // Calculate the pool SOL account PDA
    const [poolSolAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool_sol'), mintAccount.toBuffer()],
      this.sdk.programId
    );

    return {
      curveAccount,
      poolTokenAccount,
      poolBorrowTokenAccount,
      poolSolAccount
    };
  }




}

module.exports = TradingModule;
