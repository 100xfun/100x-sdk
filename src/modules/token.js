const { ComputeBudgetProgram, PublicKey, Transaction, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const anchor = require('@coral-xyz/anchor');
// Uniformly use the buffer package, consistent across all platforms
const { Buffer } = require('buffer');

// Metaplex Token Metadata program ID
const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/**
 * Token Module
 * Handles token creation, queries, balance and other operations
 */
class TokenModule {
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Create a new token
   * @param {Object} params - Creation parameters
   * @param {Keypair} params.mint - Token mint keypair
   * @param {string} params.name - Token name
   * @param {string} params.symbol - Token symbol
   * @param {string} params.uri - Metadata URI
   * @param {PublicKey} params.payer - Creator public key (payer)
   *
   * === Phase 2 addition: advanced pool optional parameters (all 5 must be provided together or none at all) ===
   * @param {anchor.BN} [params.customLpSol] - Custom liquidity pool SOL amount (lamports, 9-digit precision)
   *   - Not provided or null: creates a standard pool using the default value of 30 SOL
   *   - Provided: creates an advanced pool, must be within the range 10 SOL ~ 1000 SOL
   *   - ⚠️ Must be provided together with the other 4 custom parameters
   *
   * @param {anchor.BN} [params.customLpToken] - Custom liquidity pool Token amount (smallest unit, 9-digit precision)
   *   - Not provided or null: uses the default value of 1.073 billion Token
   *   - Provided: must be within the range 100 million ~ 10 billion Token
   *
   * @param {number} [params.customBorrowRatio] - Custom borrow pool token ratio (5-30 means 5%-30%)
   *   - Not provided or null: uses the default value of 20%
   *   - Provided: must be within the range 5 ~ 30
   *
   * @param {number} [params.customBorrowDuration] - Custom borrow duration (seconds)
   *   - Not provided or null: uses the default value configured in the Params account
   *   - Provided: must be within the range 3 days (259200 seconds) ~ 6 months (15552000 seconds)
   *
   * @param {number} [params.customFee] - Custom fee rate (unit: basis points)
   *   - Not provided or null: uses the default fee configured in the Params account
   *   - Provided: must be within the range 1000 ~ 5000 (representing 1% ~ 5%)
   *   - Example: 2000 means 2%
   *   - Borrow fee is automatically increased by 20% (e.g. setting 2000 results in swap_fee=2000, borrow_fee=2400)
   *
   * @returns {Promise<Object>} Object containing transaction, signers and account info
   *
   * @example
   * // Create a standard token (using default parameters)
   * const result = await sdk.token.create({
   *   mint: mintKeypair,
   *   name: "My Token",
   *   symbol: "MTK",
   *   uri: "https://example.com/metadata.json",
   *   payer: wallet.publicKey
   * });
   *
   * @example
   * // Create an advanced token (custom liquidity pool parameters, all 5 parameters must be provided)
   * const anchor = require('@coral-xyz/anchor');
   * const result = await sdk.token.create({
   *   mint: mintKeypair,
   *   name: "Advanced Token",
   *   symbol: "ADV",
   *   uri: "https://example.com/metadata.json",
   *   payer: wallet.publicKey,
   *   customLpSol: new anchor.BN('60000000000'),              // 60 SOL
   *   customLpToken: new anchor.BN('1073000000000000000'),    // 1.073 billion Token
   *   customBorrowRatio: 15,                                   // 15%
   *   customBorrowDuration: 7 * 24 * 3600,                     // 7 days
   *   customFee: 2000                                          // 2% (2000 basis points)
   * });
   */
  async create({
    mint,
    name,
    symbol,
    uri,
    payer,
    // Advanced pool optional parameters (all 5 must be provided together or none at all)
    customLpSol = null,
    customLpToken = null,
    customBorrowRatio = null,
    customBorrowDuration = null,
    customFee = null
  }) {
    console.log('Token Module - Create:', {
      mint: mint.publicKey.toString(),
      name,
      symbol,
      uri,
      payer: payer.toString(),
      // Advanced pool parameters log
      poolType: (customLpSol === null && customLpToken === null &&
                 customBorrowRatio === null && customBorrowDuration === null &&
                 customFee === null)
                ? 'Standard (default params)'
                : 'Advanced (custom params)',
      customLpSol: customLpSol?.toString() || 'null',
      customLpToken: customLpToken?.toString() || 'null',
      customBorrowRatio: customBorrowRatio ?? 'null',
      customBorrowDuration: customBorrowDuration ?? 'null',
      customFee: customFee ?? 'null'
    });

    // Calculate borrowing liquidity pool account address (borrowing_curve)
    const [curveAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("borrowing_curve"),
        mint.publicKey.toBuffer(),
      ],
      this.sdk.programId
    );

    // Calculate liquidity pool token account address (pool_token)
    const [poolTokenAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool_token"),
        mint.publicKey.toBuffer(),
      ],
      this.sdk.programId
    );

    // Calculate borrow pool token account address (pool_borrow_token)
    const [poolBorrowTokenAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool_borrow_token"),
        mint.publicKey.toBuffer(),
      ],
      this.sdk.programId
    );

    // Calculate liquidity pool SOL account address (pool_sol)
    const [poolSolAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool_sol"),
        mint.publicKey.toBuffer(),
      ],
      this.sdk.programId
    );

    // Calculate order book accounts (new)
    const [upOrderbook] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("up_orderbook"),
        mint.publicKey.toBuffer(),
      ],
      this.sdk.programId
    );

    const [downOrderbook] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("down_orderbook"),
        mint.publicKey.toBuffer(),
      ],
      this.sdk.programId
    );

    // Calculate Metaplex metadata account address
    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        METADATA_PROGRAM_ID.toBuffer(),
        mint.publicKey.toBuffer(),
      ],
      METADATA_PROGRAM_ID
    );

    console.log('Calculated account addresses:');
    console.log('  Borrowing liquidity pool account:', curveAccount.toString());
    console.log('  Liquidity pool token account:', poolTokenAccount.toString());
    console.log('  Borrow pool token account:', poolBorrowTokenAccount.toString());
    console.log('  Liquidity pool SOL account:', poolSolAccount.toString());
    console.log('  Up orderbook:', upOrderbook.toString());
    console.log('  Down orderbook:', downOrderbook.toString());
    console.log('  Metadata account:', metadataAccount.toString());
    console.log('  Params account:', this.sdk.paramsAccount?.toString() || 'Not set');

    // Validate required configuration
    if (!this.sdk.paramsAccount) {
      throw new Error('SDK paramsAccount not configured, please provide paramsAccount configuration during initialization');
    }

    // Create compute budget instruction
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400000
    });

    // Build the create token instruction (passing in 5 custom parameters)
    const createIx = await this.sdk.program.methods
      .createToken(
        name,
        symbol,
        uri,
        customLpSol,           // Option<u64>
        customLpToken,         // Option<u64>
        customBorrowRatio,     // Option<u8>
        customBorrowDuration,  // Option<u32>
        customFee              // Option<u16> - new parameter
      )
      .accounts({
        payer: payer,
        mintAccount: mint.publicKey,
        curveAccount: curveAccount,
        poolTokenAccount: poolTokenAccount,
        poolBorrowTokenAccount: poolBorrowTokenAccount,
        poolSolAccount: poolSolAccount,
        upOrderbook: upOrderbook,
        downOrderbook: downOrderbook,
        metadata: metadataAccount,
        metadataProgram: METADATA_PROGRAM_ID,
        params: this.sdk.paramsAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .instruction();

    // Create transaction and add instructions
    const transaction = new Transaction();
    transaction.add(modifyComputeUnits);
    transaction.add(createIx);

    console.log('Token creation transaction built, signers required:', [payer.toString(), mint.publicKey.toString()]);

    return {
      transaction,
      signers: [mint], // mint keypair needs to be a signer
      accounts: {
        mint: mint.publicKey,
        curveAccount,
        poolTokenAccount,
        poolBorrowTokenAccount,
        poolSolAccount,
        upOrderbook,
        downOrderbook,
        metadataAccount,
        payer
      }
    };
  }

  /**
   * Create token and buy in one transaction
   * Merges the create and buy instructions into a single transaction, submitted with one signature
   *
   * @param {Object} params - Creation and buy parameters
   * @param {Keypair} params.mint - Token mint keypair
   * @param {string} params.name - Token name
   * @param {string} params.symbol - Token symbol
   * @param {string} params.uri - Metadata URI
   * @param {PublicKey} params.payer - Creator public key (payer)
   * @param {anchor.BN} params.buyTokenAmount - Amount of tokens to buy
   * @param {anchor.BN} params.maxSolAmount - Maximum SOL to spend
   *
   * === Phase 2 addition: advanced pool optional parameters (all 5 must be provided together or none at all) ===
   * @param {anchor.BN} [params.customLpSol] - Custom liquidity pool SOL amount (lamports, 9-digit precision)
   * @param {anchor.BN} [params.customLpToken] - Custom liquidity pool Token amount (smallest unit, 9-digit precision)
   * @param {number} [params.customBorrowRatio] - Custom borrow pool token ratio (5-30 means 5%-30%)
   * @param {number} [params.customBorrowDuration] - Custom borrow duration (seconds)
   * @param {number} [params.customFee] - Custom fee rate (1000-5000 basis points, representing 1%-5%)
   *
   * @param {Object} options - Optional parameters
   * @param {number} options.computeUnits - Compute units limit, default 1800000
   * @returns {Promise<Object>} Object containing transaction, signers and account info
   */
  async createAndBuy({
    mint,
    name,
    symbol,
    uri,
    payer,
    buyTokenAmount,
    maxSolAmount,
    // Advanced pool optional parameters (all 5 must be provided together or none at all)
    customLpSol = null,
    customLpToken = null,
    customBorrowRatio = null,
    customBorrowDuration = null,
    customFee = null
  }, options = {}) {
    const { computeUnits = 1800000 } = options;

    console.log('Token Module - CreateAndBuy:', {
      mint: mint.publicKey.toString(),
      name,
      symbol,
      uri,
      payer: payer.toString(),
      buyTokenAmount: buyTokenAmount.toString(),
      maxSolAmount: maxSolAmount.toString()
    });

    // 1. Parameter validation
    if (!anchor.BN.isBN(buyTokenAmount) || !anchor.BN.isBN(maxSolAmount)) {
      throw new Error('buyTokenAmount and maxSolAmount must be anchor.BN type');
    }

    // 2. Call the create method to get the create transaction (passing all custom parameters)
    console.log('Step 1: Building create transaction...');
    const createResult = await this.create({
      mint,
      name,
      symbol,
      uri,
      payer,
      // Pass custom liquidity pool parameters (5 parameters)
      customLpSol,
      customLpToken,
      customBorrowRatio,
      customBorrowDuration,
      customFee
    });

    // 3. Read the fee recipient address from the params account
    // Because curve_account has not been created yet, it cannot be read from chain
    console.log('Step 2: Fetching fee recipient accounts from params...');

    // Get the fee recipient accounts directly from the SDK configuration (these are set during SDK initialization)
    // Avoid using program.account.params.fetch() because there may be provider configuration issues
    const feeRecipientAccount = this.sdk.feeRecipient;
    const baseFeeRecipientAccount = this.sdk.baseFeeRecipient;

    // Validate that these accounts are configured
    if (!feeRecipientAccount || !baseFeeRecipientAccount) {
      throw new Error('Fee recipient accounts not configured in SDK options');
    }

    console.log('Fee recipient accounts:');
    console.log('  Partner fee recipient:', feeRecipientAccount.toString());
    console.log('  Base fee recipient:', baseFeeRecipientAccount.toString());

    // 4. Prepare the extra accounts required for buy
    console.log('Step 3: Calculating buy-related accounts...');
    const mintPubkey = mint.publicKey;

    // Calculate user token account
    const userTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      payer
    );

    // Calculate cooldown PDA
    const [cooldownPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('trade_cooldown'),
        mintPubkey.toBuffer(),
        payer.toBuffer()
      ],
      this.sdk.programId
    );

    // Calculate orderbook PDAs (reuse the values calculated in create)
    const [upOrderbook] = PublicKey.findProgramAddressSync(
      [Buffer.from('up_orderbook'), mintPubkey.toBuffer()],
      this.sdk.programId
    );

    const [downOrderbook] = PublicKey.findProgramAddressSync(
      [Buffer.from('down_orderbook'), mintPubkey.toBuffer()],
      this.sdk.programId
    );

    console.log('Buy-related accounts:');
    console.log('  User token account:', userTokenAccount.toString());
    console.log('  Cooldown PDA:', cooldownPDA.toString());

    // 5. Check if the user token account exists, create ATA instruction
    console.log('Step 4: Checking if user token account exists...');
    const userTokenAccountInfo = await this.sdk.connection.getAccountInfo(userTokenAccount);
    const createAtaIx = userTokenAccountInfo === null
      ? createAssociatedTokenAccountInstruction(
          payer,
          userTokenAccount,
          payer,
          mintPubkey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      : null;

    if (createAtaIx) {
      console.log('  User token account does not exist, will create it');
    } else {
      console.log('  User token account already exists');
    }

    // 6. Build the buy instruction
    console.log('Step 5: Building buy instruction...');
    const buyIx = await this.sdk.program.methods
      .buy(buyTokenAmount, maxSolAmount)
      .accounts({
        payer: payer,
        mintAccount: mintPubkey,
        curveAccount: createResult.accounts.curveAccount,
        poolTokenAccount: createResult.accounts.poolTokenAccount,
        poolBorrowTokenAccount: createResult.accounts.poolBorrowTokenAccount,
        poolSolAccount: createResult.accounts.poolSolAccount,
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

    // 7. Merge transactions: create + buy
    console.log('Step 6: Merging create and buy transactions...');
    const transaction = new Transaction();

    // Set compute unit limit
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits
    });
    transaction.add(modifyComputeUnits);

    // Add all instructions from the create transaction (skip the compute unit instruction in create)
    createResult.transaction.instructions.forEach(ix => {
      // Skip the compute unit instruction in the create transaction (we already added it)
      if (ix.programId.equals(ComputeBudgetProgram.programId)) {
        return;
      }
      transaction.add(ix);
    });

    // Add ATA creation instruction (if needed)
    if (createAtaIx) {
      transaction.add(createAtaIx);
    }

    // Add buy instruction
    transaction.add(buyIx);

    console.log('CreateAndBuy transaction built successfully:');
    console.log('  Total instructions:', transaction.instructions.length);
    console.log('  Compute units:', computeUnits);
    console.log('  Signers required:', [payer.toString(), mint.publicKey.toString()]);

    // 8. Return the merged transaction
    return {
      transaction,
      signers: [mint],  // mint keypair needs to sign
      accounts: {
        // create accounts
        ...createResult.accounts,
        // buy accounts
        userTokenAccount,
        cooldown: cooldownPDA,
        feeRecipientAccount,
        baseFeeRecipientAccount
      }
    };
  }

}

module.exports = TokenModule;
