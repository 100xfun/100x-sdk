const anchor = require('@coral-xyz/anchor');
const { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
// Uniformly use the buffer package, consistent across all platforms
const { Buffer } = require('buffer');

/**
 * Tools Module
 * Provides trading utility functions: approve trade and close cooldown PDA
 */
class ToolsModule {
  /**
   * Constructor
   * @param {Fun100xSdk} sdk - SDK instance
   */
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Approve current token balance for trading
   *
   * Use Cases:
   * 1. After receiving tokens from another address and wanting to trade immediately
   * 2. Reactivating cooldown PDA
   *
   * @param {Object} params - Parameters
   * @param {PublicKey|string} params.mint - Token mint address
   * @param {Keypair} params.wallet - User wallet for signing
   * @returns {Promise<Object>} Transaction object and related account info
   *
   * @example
   * const result = await sdk.tools.approveTrade({
   *   mint: 'xxxxx',
   *   wallet: userKeypair
   * });
   *
   * const signature = await this.sdk.connection.sendTransaction(
   *   result.transaction,
   *   [wallet]
   * );
   */
  async approveTrade(params) {
    const { mint, wallet } = params;

    // Validate parameters
    if (!mint) {
      throw new Error('mint parameter is required');
    }
    if (!wallet) {
      throw new Error('wallet parameter is required');
    }

    // Convert mint to PublicKey
    const mintPubkey = typeof mint === 'string' ? new PublicKey(mint) : mint;
    const walletPubkey = wallet.publicKey;

    // Calculate user token account
    const userTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      walletPubkey
    );

    // Calculate trade cooldown PDA
    const [cooldown] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('trade_cooldown'),
        mintPubkey.toBuffer(),
        walletPubkey.toBuffer()
      ],
      this.sdk.programId
    );

    // Build instruction
    const approveTradeIx = await this.sdk.program.methods
      .approveTrade()
      .accounts({
        payer: walletPubkey,
        mintAccount: mintPubkey,
        userTokenAccount: userTokenAccount,
        cooldown: cooldown,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .instruction();

    // Build transaction
    const transaction = new Transaction().add(approveTradeIx);

    // Return result
    return {
      transaction,
      signers: [],
      accounts: {
        payer: walletPubkey,
        mintAccount: mintPubkey,
        userTokenAccount: userTokenAccount,
        cooldown: cooldown,
      }
    };
  }

  /**
   * Manually close TradeCooldown PDA and reclaim rent
   *
   * Conditions:
   * 1. Can only close your own PDA (verified through seeds)
   *
   * Use Cases:
   * - User wants to reclaim rent
   * - Clean up unused PDAs
   * - Admin batch cleanup of expired PDAs
   *
   * Notes:
   * - No need to verify token balance, can be recreated via approve_trade after closing
   * - After PDA is closed, next buy or approve will automatically recreate it
   *
   * @param {Object} params - Parameters
   * @param {PublicKey|string} params.mint - Token mint address
   * @param {Keypair} params.wallet - User wallet for signing
   * @returns {Promise<Object>} Transaction object and related account info
   *
   * @example
   * const result = await sdk.tools.closeTradeCooldown({
   *   mint: 'xxxxx',
   *   wallet: userKeypair
   * });
   *
   * const signature = await this.sdk.connection.sendTransaction(
   *   result.transaction,
   *   [wallet]
   * );
   */
  async closeTradeCooldown(params) {
    const { mint, wallet } = params;

    // Validate parameters
    if (!mint) {
      throw new Error('mint parameter is required');
    }
    if (!wallet) {
      throw new Error('wallet parameter is required');
    }

    // Convert mint to PublicKey
    const mintPubkey = typeof mint === 'string' ? new PublicKey(mint) : mint;
    const walletPubkey = wallet.publicKey;

    // Calculate user token account
    const userTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      walletPubkey
    );

    // Calculate trade cooldown PDA
    const [cooldown] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('trade_cooldown'),
        mintPubkey.toBuffer(),
        walletPubkey.toBuffer()
      ],
      this.sdk.programId
    );

    // Get cooldown account to fetch bump
    // Use manual fetch method to avoid provider issues
    const cooldownAccountInfo = await this.sdk.connection.getAccountInfo(cooldown);
    if (!cooldownAccountInfo) {
      throw new Error(`Cooldown PDA does not exist for mint: ${mint} and wallet: ${wallet.publicKey.toString()}`);
    }

    const accountsCoder = new anchor.BorshAccountsCoder(this.sdk.program.idl);
    let cooldownAccountData;
    try {
      cooldownAccountData = accountsCoder.decode('TradeCooldown', cooldownAccountInfo.data);
    } catch (e1) {
      try {
        cooldownAccountData = accountsCoder.decode('tradeCooldown', cooldownAccountInfo.data);
      } catch (e2) {
        throw new Error(`Cannot decode cooldown account: ${e1.message}`);
      }
    }

    // Build instruction
    const closeTradeCooldownIx = await this.sdk.program.methods
      .closeTradeCooldown()
      .accounts({
        payer: walletPubkey,
        mintAccount: mintPubkey,
        userTokenAccount: userTokenAccount,
        cooldown: cooldown,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    // Build transaction
    const transaction = new Transaction().add(closeTradeCooldownIx);

    // Return result
    return {
      transaction,
      signers: [],
      accounts: {
        payer: walletPubkey,
        mintAccount: mintPubkey,
        userTokenAccount: userTokenAccount,
        cooldown: cooldown,
      },
      cooldownInfo: {
        lastTradeTime: cooldownAccountData.lastTradeTime,
        approvalTokenAmount: cooldownAccountData.approvalTokenAmount,
        bump: cooldownAccountData.bump,
      }
    };
  }

  /**
   * Validate cooldown PDA approval_token_amount matches user's current token balance
   *
   * Use Cases:
   * - Before trading, verify if the cooldown PDA is in sync with user's token balance
   * - Check if user needs to call approveTrade after receiving tokens
   * - Validate cooldown state for security checks
   *
   * @param {Object} params - Parameters
   * @param {PublicKey|string} params.mint - Token mint address
   * @param {Keypair|Object} params.wallet - User wallet (can be Keypair or object with publicKey)
   * @param {anchor.BN|number|string} [params.tokenBalance] - Optional: user's current token balance, if not provided will fetch from chain
   * @returns {Promise<Object>} Validation result with detailed info
   *
   * @example
   * // Auto-fetch token balance from chain
   * const result = await sdk.tools.validateCooldown({
   *   mint: 'xxxxx',
   *   wallet: userKeypair
   * });
   *
   * // Provide token balance manually
   * const result = await sdk.tools.validateCooldown({
   *   mint: 'xxxxx',
   *   wallet: userKeypair,
   *   tokenBalance: new anchor.BN('1000000')
   * });
   *
   * console.log(result.isValid); // true/false
   * console.log(result.cooldownInfo.approvalTokenAmount);
   * console.log(result.tokenBalance);
   */
  async validateCooldown(params) {
    const { mint, wallet, tokenBalance } = params;

    // Validate parameters
    if (!mint) {
      throw new Error('mint parameter is required');
    }
    if (!wallet) {
      throw new Error('wallet parameter is required');
    }

    // Convert mint to PublicKey
    const mintPubkey = typeof mint === 'string' ? new PublicKey(mint) : mint;
    const walletPubkey = wallet.publicKey || wallet;

    // Calculate user token account
    const userTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      walletPubkey
    );

    // Calculate trade cooldown PDA
    const [cooldown] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('trade_cooldown'),
        mintPubkey.toBuffer(),
        walletPubkey.toBuffer()
      ],
      this.sdk.programId
    );

    // Get cooldown account data
    const cooldownAccountInfo = await this.sdk.connection.getAccountInfo(cooldown);
    if (!cooldownAccountInfo) {
      // Cooldown PDA does not exist, return status without throwing error
      return {
        isValid: false,
        exists: false,
        reason: 'COOLDOWN_NOT_EXISTS',
        message: 'Cooldown PDA does not exist. User has never traded this token or needs to call approveTrade first.',
        cooldownInfo: null,
        tokenBalance: null,
        accounts: {
          mintAccount: mintPubkey,
          userTokenAccount: userTokenAccount,
          cooldown: cooldown,
          wallet: walletPubkey,
        }
      };
    }

    const accountsCoder = new anchor.BorshAccountsCoder(this.sdk.program.idl);
    let cooldownAccountData;
    try {
      cooldownAccountData = accountsCoder.decode('TradeCooldown', cooldownAccountInfo.data);
    } catch (e1) {
      try {
        cooldownAccountData = accountsCoder.decode('tradeCooldown', cooldownAccountInfo.data);
      } catch (e2) {
        throw new Error(`Cannot decode cooldown account: ${e1.message}`);
      }
    }

    // Get user's current token balance
    let currentTokenBalance;
    if (tokenBalance !== undefined && tokenBalance !== null) {
      // Use provided token balance
      if (anchor.BN.isBN(tokenBalance)) {
        currentTokenBalance = tokenBalance;
      } else {
        currentTokenBalance = new anchor.BN(tokenBalance.toString());
      }
    } else {
      // Fetch token balance from chain
      const userTokenAccountInfo = await this.sdk.connection.getAccountInfo(userTokenAccount);
      if (!userTokenAccountInfo) {
        throw new Error(`User token account does not exist for mint: ${mint} and wallet: ${walletPubkey.toString()}`);
      }

      try {
        // Fetch SPL token account balance
        const tokenAccountInfo = await this.sdk.connection.getTokenAccountBalance(userTokenAccount);
        currentTokenBalance = new anchor.BN(tokenAccountInfo.value.amount);
      } catch (e) {
        throw new Error(`Cannot fetch token balance: ${e.message}`);
      }
    }

    // Compare approval_token_amount with current token balance
    // Valid if approval_token_amount >= current token balance
    const approvalTokenAmount = new anchor.BN(cooldownAccountData.approvalTokenAmount.toString());
    const isValid = approvalTokenAmount.gte(currentTokenBalance);

    // Return result
    return {
      isValid,
      exists: true,
      reason: isValid ? 'VALID' : 'AMOUNT_MISMATCH',
      message: isValid
        ? 'Cooldown validation passed. approval_token_amount >= token_balance'
        : 'Cooldown validation failed. approval_token_amount < token_balance. User needs to call approveTrade.',
      cooldownInfo: {
        approvalTokenAmount: cooldownAccountData.approvalTokenAmount,
        lastTradeTime: cooldownAccountData.lastTradeTime,
        bump: cooldownAccountData.bump,
      },
      tokenBalance: currentTokenBalance,
      accounts: {
        mintAccount: mintPubkey,
        userTokenAccount: userTokenAccount,
        cooldown: cooldown,
        wallet: walletPubkey,
      }
    };
  }
}

module.exports = ToolsModule;
