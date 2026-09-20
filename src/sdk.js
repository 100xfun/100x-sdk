const anchor = require('@coral-xyz/anchor');
const { PublicKey } = require('@solana/web3.js');
// Use the buffer package consistently across all platforms
const { Buffer } = require('buffer');

// Environment detection and conditional loading
const IS_NODE = typeof process !== 'undefined' && process.versions && process.versions.node;

// Ensure global availability (compatible with existing code)
if (typeof global !== 'undefined' && !global.Buffer) {
  global.Buffer = Buffer;
}

const TradingModule = require('./modules/trading');
const TokenModule = require('./modules/token');
const ParamModule = require('./modules/param');
const FastModule = require('./modules/fast');
const SimulatorModule = require('./modules/simulator');
const ChainModule = require('./modules/chain');
const ToolsModule = require('./modules/tools');
const OrderUtils = require('./utils/orderUtils');
const CurveAMM = require('./utils/curve_amm');
const idlLocalnet = require('./idl/fun100x_localnet.json');
const idlMain = require('./idl/fun100x_main.json');

function getIdlByNetwork(network) {
  if (network === 'localnet') return idlLocalnet;
  return idlMain;
}

/**
 * 100x SDK Main Class
 * Provides modular interfaces for interacting with 100x protocol
 */
class Fun100xSdk {
  /**
   * Constructor
   * @param {Connection} connection - Solana connection instance
   * @param {Wallet|Keypair} wallet - Wallet instance
   * @param {PublicKey|string} programId - Program ID
   * @param {Object} options - Configuration options (optional)
   */
  constructor(connection, programId, options = {}) {
    //console.log("Fun100xSdk options=",options)
    // Save configuration options
    this.options = options;

    // Validate defaultDataSource configuration
    if (options.defaultDataSource && !['fast', 'chain'].includes(options.defaultDataSource)) {
      throw new Error('defaultDataSource must be "fast" or "chain"');
    }

   //console.log("options.defaultDataSource",options.defaultDataSource)
    //this.defaultDataSource = options.defaultDataSource || 'fast';
    this.defaultDataSource = options.defaultDataSource || 'chain';

    console.log('Data source method:', this.defaultDataSource);

    // Basic configuration
    this.connection = connection;
    //this.wallet = wallet instanceof anchor.Wallet ? wallet : new anchor.Wallet(wallet);
    this.programId = typeof programId === 'string' ? new PublicKey(programId) : programId;
    this.idl = getIdlByNetwork(options.network);

    // Initialize account configuration with options
    this.feeRecipient = this._parsePublicKey(this.options.feeRecipient);
    this.baseFeeRecipient = this._parsePublicKey(this.options.baseFeeRecipient);
    this.paramsAccount = this._parsePublicKey(this.options.paramsAccount);
    this.fastApiUrl = this.options.fastApiUrl;

    // Maximum number of orders that can be processed at once in the contract
    this.MAX_ORDERS_COUNT = 50
    // Maximum number of orders to fetch during queries
    this.FIND_MAX_ORDERS_COUNT = 1000

    // When liquidity is insufficient, the suggested ratio of liquidity to actually use, per-mille (1000=100%)
    this.SUGGEST_LIQ_RATIO = 975; // 97.5% (1000=100%)

    // Initialize Anchor program
    this.program = this._initProgram(this.options);

    // Initialize functional modules
    this.trading = new TradingModule(this);
    this.token = new TokenModule(this);
    this.param = new ParamModule(this);
    this.fast = new FastModule(this);
    this.simulator = new SimulatorModule(this);
    this.chain = new ChainModule(this);
    this.tools = new ToolsModule(this);

    // Initialize curve AMM utility
    this.curve = CurveAMM;

    /**
     * Unified data interface - automatically routes to fast or chain module based on defaultDataSource config
     *
     * @example
     * // Fetch orders using the default data source
     * const ordersData = await sdk.data.orders(mint, { type: 'down_orders' });
     *
     * // Temporarily specify a data source
     * const ordersData = await sdk.data.orders(mint, {
     *   type: 'down_orders',
     *   dataSource: 'chain'  // Temporarily use the on-chain data source
     * });
     *
     * // Fetch user orders
     * const userOrders = await sdk.data.user_orders(user, mint, {
     *   page: 1,
     *   limit: 200,
     *   order_by: 'start_time_desc'
     * });
     */
    this.data = {
      /**
       * Get token orders data
       * @param {string} mint - Token address
       * @param {Object} options - Query parameters; supports the dataSource field to temporarily specify a data source
       * @returns {Promise<Object>} Orders data
       */
      orders: (mint, options = {}) => this._getDataWithSource('orders', [mint, options]),

      /**
       * Get token price data
       * @param {string} mint - Token address
       * @param {Object} options - Query parameters; supports the dataSource field to temporarily specify a data source
       * @returns {Promise<string>} Price string
       */
      price: (mint, options = {}) => this._getDataWithSource('price', [mint, options]),

      /**
       * Get user orders data
       * @param {string} user - User address
       * @param {string} mint - Token address
       * @param {Object} options - Query parameters; supports the dataSource field to temporarily specify a data source
       * @returns {Promise<Object>} User orders data
       */
      user_orders: (user, mint, options = {}) => this._getDataWithSource('user_orders', [user, mint, options])
    };
  }

  /**
   * Parse PublicKey
   * @private
   * @param {PublicKey|string|null} key - Key to parse
   * @returns {PublicKey|null}
   */
  _parsePublicKey(key) {
    if (!key) return null;
    return typeof key === 'string' ? new PublicKey(key) : key;
  }

  /**
   * Initialize Anchor program instance
   * @private
   */
  _initProgram(options = {}) {
    const provider = new anchor.AnchorProvider(
      this.connection,
      {
        commitment: options.commitment,
        preflightCommitment: options.preflightCommitment,
        skipPreflight: options.skipPreflight || false,
        maxRetries: options.maxRetries,
        ...options
      }
    );

    anchor.setProvider(provider);

    return new anchor.Program(this.idl, this.programId);
  }

  // ========== Unified Data Interface Routing Method ==========

  /**
   * Route data requests based on configuration
   *
   * @private
   * @param {string} method - Method name
   * @param {Array} args - Arguments array
   * @returns {Promise} Returns result from corresponding module method
   */
  _getDataWithSource(method, args) {
    // Extract dataSource configuration from last parameter
    const lastArg = args[args.length - 1] || {};
    const dataSource = lastArg.dataSource || this.defaultDataSource;

    // Route to corresponding module based on data source
    const module = dataSource === 'chain' ? this.chain : this.fast;

    if (!module[method]) {
      throw new Error(`Method ${method} does not exist in ${dataSource} module`);
    }

    return module[method](...args);
  }

}

// Add utility classes as static properties on the Fun100xSdk class
Fun100xSdk.CurveAMM = CurveAMM;
Fun100xSdk.OrderUtils = OrderUtils;

module.exports = Fun100xSdk;
