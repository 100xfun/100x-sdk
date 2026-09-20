import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { BN, Wallet, Program } from '@coral-xyz/anchor';

// ========================= 基础类型定义 =========================

export type DataSourceType = 'fast' | 'chain';

export type NetworkType = 'mainnet' | 'localnet';

export interface NetworkConfig {
  name: string;
  network: NetworkType;
  programId: string;
  defaultDataSource: DataSourceType;
  solanaEndpoint: string;
  fastApiUrl: string;
  feeRecipient: string;
  baseFeeRecipient: string;
  paramsAccount: string;
}

export interface Fun100xSdkOptions {
  network?: NetworkType;
  defaultDataSource?: DataSourceType;
  solanaEndpoint?: string;
  fastApiUrl?: string;
  feeRecipient?: string;
  baseFeeRecipient?: string;
  paramsAccount?: string;
}

// ========================= 订单和交易相关类型 =========================

export interface OrderData {
  order_pda: string;
  user: string;
  mint: string;
  order_type: string;
  lock_lp_sol_amount: string;
  lock_lp_token_amount: string;
  lock_lp_start_price: string;
  lock_lp_end_price: string;
  margin_sol_amount: string;
  borrow_amount: string;
  position_asset_amount: string;
  created_at?: string;
  updated_at?: string;
}

export interface LpPair {
  solAmount: BN;
  tokenAmount: BN;
}

export interface TransactionResult {
  transaction: Transaction;
  signers: Keypair[];
  accounts: Record<string, PublicKey>;
  orderData?: {
    ordersUsed: number;
    lpPairsCount: number;
    lpPairs: LpPair[];
    orderAccounts: (string | null)[];
    [key: string]: any;
  };
}

export interface OrdersResponse {
  data: {
    orders: OrderData[];
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface PriceResponse {
  price: string;
  price_u128: string;
  [key: string]: any;
}

export interface MintInfo {
  mint: string;
  name?: string;
  symbol?: string;
  decimals: number;
  total_supply?: string;
  [key: string]: any;
}

// ========================= 交易参数类型 =========================

export interface BuyParams {
  mintAccount: string | PublicKey;
  buyTokenAmount: BN;
  maxSolAmount: BN;
  payer: PublicKey;
}

export interface SellParams {
  mintAccount: string | PublicKey;
  sellTokenAmount: BN;
  minSolOutput: BN;
  payer: PublicKey;
}

export interface LongParams {
  mintAccount: string | PublicKey;
  buyTokenAmount: BN;
  maxSolAmount: BN;
  marginSol: BN;
  closePrice: BN;
  prevOrder?: PublicKey | null;
  nextOrder?: PublicKey | null;
  payer: PublicKey;
}

export interface ShortParams {
  mintAccount: string | PublicKey;
  borrowSellTokenAmount: BN;
  minSolOutput: BN;
  marginSol: BN;
  closePrice: BN;
  prevOrder?: PublicKey | null;
  nextOrder?: PublicKey | null;
  payer: PublicKey;
}

export interface CloseLongParams {
  mintAccount: string | PublicKey;
  closeOrder: string | PublicKey;
  sellTokenAmount: BN;
  minSolOutput: BN;
  payer: PublicKey;
}

export interface CloseShortParams {
  mintAccount: string | PublicKey;
  closeOrder: string | PublicKey;
  buyTokenAmount: BN;
  maxSolAmount: BN;
  payer: PublicKey;
}

export interface TransactionOptions {
  computeUnits?: number;
}

// ========================= 查询参数类型 =========================

export interface OrdersQueryOptions {
  type?: 'up_orders' | 'down_orders';
  limit?: number;
  page?: number;
  dataSource?: DataSourceType;
}

export interface PriceQueryOptions {
  dataSource?: DataSourceType;
}

export interface UserOrdersQueryOptions {
  type?: 'up_orders' | 'down_orders';
  limit?: number;
  page?: number;
  dataSource?: DataSourceType;
}

// ========================= 模拟器相关类型 =========================

export interface SimulationResult {
  liqResult: {
    free_lp_sol_amount_sum: bigint;
    free_lp_token_amount_sum: bigint;
    lock_lp_sol_amount_sum: bigint;
    lock_lp_token_amount_sum: bigint;
    has_infinite_lp: boolean;
    pass_order_id: number;
    force_close_num: number;
    ideal_lp_sol_amount: bigint;
    real_lp_sol_amount: bigint;
  };
  completion: string;
  slippage: string;
  suggestedTokenAmount: string;
  suggestedSolAmount: string;
}

// ========================= 工具类相关类型 =========================

export interface FindPrevNextResult {
  prevOrder: OrderData | null;
  nextOrder: OrderData | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ========================= 模块接口定义 =========================

export interface TradingModule {
  buy(params: BuyParams, options?: TransactionOptions): Promise<TransactionResult>;
  sell(params: SellParams, options?: TransactionOptions): Promise<TransactionResult>;
  long(params: LongParams, options?: TransactionOptions): Promise<TransactionResult>;
  short(params: ShortParams, options?: TransactionOptions): Promise<TransactionResult>;
  closeLong(params: CloseLongParams, options?: TransactionOptions): Promise<TransactionResult>;
  closeShort(params: CloseShortParams, options?: TransactionOptions): Promise<TransactionResult>;
}

export interface FastModule {
  mints(options?: any): Promise<any>;
  mint_info(mint: string): Promise<MintInfo>;
  orders(mint: string, options?: OrdersQueryOptions): Promise<OrdersResponse>;
  price(mint: string, options?: PriceQueryOptions): Promise<PriceResponse>;
  user_orders(user: string, mint: string, options?: UserOrdersQueryOptions): Promise<OrdersResponse>;
}

export interface ChainModule {
  getCurveAccount(mint: string): Promise<any>;
  orders(mint: string, options?: OrdersQueryOptions): Promise<OrdersResponse>;
  price(mint: string, options?: PriceQueryOptions): Promise<PriceResponse>;
}

export interface TokenModule {
  create(params: any): Promise<TransactionResult>;
}

export interface ParamModule {
  createParams(params: any): Promise<TransactionResult>;
  getParams(partner: string): Promise<any>;
  getAdmin(): Promise<any>;
}

export interface SimulatorModule {
  simulateTokenBuy(mint: string, buyTokenAmount: bigint | string | number, passOrder?: string | null): Promise<SimulationResult>;
  simulateTokenSell(mint: string, sellTokenAmount: bigint | string | number, passOrder?: string | null): Promise<SimulationResult>;
  simulateLongStopLoss(mint: string, buyTokenAmount: bigint | string | number, stopLossPrice: bigint | string | number, lastPrice?: any, ordersData?: any): Promise<any>;
  simulateSellStopLoss(mint: string, sellTokenAmount: bigint | string | number, stopLossPrice: bigint | string | number, lastPrice?: any, ordersData?: any): Promise<any>;
}

// ========================= 数据接口类型 =========================

export interface DataInterface {
  orders(mint: string, options?: OrdersQueryOptions): Promise<OrdersResponse>;
  price(mint: string, options?: PriceQueryOptions): Promise<PriceResponse>;
}

// ========================= 主 SDK 类型定义 =========================

export declare class Fun100xSdk {
  connection: Connection;
  programId: PublicKey;
  program: Program;
  options: Fun100xSdkOptions;
  defaultDataSource: DataSourceType;
  feeRecipient: PublicKey;
  baseFeeRecipient: PublicKey;
  paramsAccount: PublicKey;
  fastApiUrl: string;

  // 常量
  readonly MAX_ORDERS_COUNT: number;
  readonly FIND_MAX_ORDERS_COUNT: number;
  readonly SUGGEST_LIQ_RATIO: number;

  // 模块
  trading: TradingModule;
  fast: FastModule;
  chain: ChainModule;
  token: TokenModule;
  param: ParamModule;
  simulator: SimulatorModule;
  data: DataInterface;

  // 静态工具类引用
  static CurveAMM: typeof CurveAMM;
  static OrderUtils: typeof OrderUtils;

  constructor(
    connection: Connection,
    programId: string | PublicKey,
    options?: Fun100xSdkOptions
  );

  // OrderUtils 快捷方法
  buildLpPairs(orders: OrderData[], direction: string, price: any, maxCount?: number): LpPair[];
  buildOrderAccounts(orders: OrderData[], maxCount?: number): (string | null)[];
  findPrevNext(orders: OrderData[], findOrderPda: string): FindPrevNextResult;
  findOrderIndex(orders: OrderData[], targetOrderPda: string | PublicKey | null): number;
}

// ========================= 工具类导出 =========================

export declare class OrderUtils {
  static buildLpPairs(orders: OrderData[], direction: string, price: any, maxCount?: number): LpPair[];
  static buildOrderAccounts(orders: OrderData[], maxCount?: number): (string | null)[];
  static findPrevNext(orders: OrderData[], findOrderPda: string): FindPrevNextResult;
  static findOrderIndex(orders: OrderData[], targetOrderPda: string | PublicKey | null): number;
  static validateOrdersFormat(orders: OrderData[], throwOnError?: boolean): boolean | ValidationResult;
}

export declare class CurveAMM {
  static readonly INITIAL_SOL_RESERVE_DECIMAL: any;
  static readonly INITIAL_TOKEN_RESERVE_DECIMAL: any;
  static readonly INITIAL_K_DECIMAL: any;
  static readonly INITIAL_MIN_PRICE_DECIMAL: any;
  static readonly PRICE_PRECISION_FACTOR_DECIMAL: any;
  static readonly TOKEN_PRECISION_FACTOR_DECIMAL: any;
  static readonly SOL_PRECISION_FACTOR_DECIMAL: any;
  static readonly MAX_U128_PRICE: bigint;
  static readonly MIN_U128_PRICE: bigint;

  // Price conversion methods
  static u128ToDecimal(price: bigint | string | number): any;
  static decimalToU128(price: any): bigint | null;
  static decimalToU128Ceil(price: any): bigint | null;
  static u64ToDecimal(price: bigint | string | number): any;
  static decimalToU64(price: any): bigint | null;
  static decimalToU64Ceil(price: any): bigint | null;

  // Token amount conversion methods
  static tokenDecimalToU64(amount: any): bigint | null;
  static tokenDecimalToU64Ceil(amount: any): bigint | null;
  static u64ToTokenDecimal(amount: bigint | string | number): any;

  // SOL amount conversion methods
  static solDecimalToU64(amount: any): bigint | null;
  static solDecimalToU64Ceil(amount: any): bigint | null;
  static u64ToSolDecimal(amount: bigint | string | number): any;

  // Initial price and K calculation
  static calculateInitialK(): any;
  static getInitialPrice(): bigint | null;

  // Custom pool parameters calculation (动态流动池)
  static calculateK(initialVirtualSol: any, initialVirtualToken: any): any;
  static getInitialPriceWithParams(initialVirtualSol: any, initialVirtualToken: any): bigint | null;

  // AMM calculation methods (default pool parameters)
  static calculateReservesByPrice(price: any, k: any): [any, any] | null;
  static buyFromPriceToPrice(startLowPrice: bigint | string | number, endHighPrice: bigint | string | number): [bigint, bigint] | null;
  static sellFromPriceToPrice(startHighPrice: bigint | string | number, endLowPrice: bigint | string | number): [bigint, bigint] | null;
  static buyFromPriceWithSolInput(startLowPrice: bigint | string | number, solInputAmount: bigint | string | number): [bigint, bigint] | null;
  static sellFromPriceWithTokenInput(startHighPrice: bigint | string | number, tokenInputAmount: bigint | string | number): [bigint, bigint] | null;
  static buyFromPriceWithTokenOutput(startLowPrice: bigint | string | number, tokenOutputAmount: bigint | string | number): [bigint, bigint] | null;
  static sellFromPriceWithSolOutput(startHighPrice: bigint | string | number, solOutputAmount: bigint | string | number): [bigint, bigint] | null;

  // AMM calculation methods with custom pool parameters (动态流动池)
  static priceToReservesWithParams(price: any, initialVirtualSol: any, initialVirtualToken: any): [any, any] | null;
  static buyFromPriceToPriceWithParams(startLowPrice: bigint | string | number, endHighPrice: bigint | string | number, initialVirtualSol: any, initialVirtualToken: any): [bigint, bigint] | null;
  static sellFromPriceToPriceWithParams(startHighPrice: bigint | string | number, endLowPrice: bigint | string | number, initialVirtualSol: any, initialVirtualToken: any): [bigint, bigint] | null;
  static buyFromPriceWithSolInputWithParams(startLowPrice: bigint | string | number, solInputAmount: bigint | string | number, initialVirtualSol: any, initialVirtualToken: any): [bigint, bigint] | null;
  static sellFromPriceWithTokenInputWithParams(startHighPrice: bigint | string | number, tokenInputAmount: bigint | string | number, initialVirtualSol: any, initialVirtualToken: any): [bigint, bigint] | null;
  static buyFromPriceWithTokenOutputWithParams(startLowPrice: bigint | string | number, tokenOutputAmount: bigint | string | number, initialVirtualSol: any, initialVirtualToken: any): [bigint, bigint] | null;
  static sellFromPriceWithSolOutputWithParams(startHighPrice: bigint | string | number, solOutputAmount: bigint | string | number, initialVirtualSol: any, initialVirtualToken: any): [bigint, bigint] | null;

  // Fee and price display methods
  static calculateAmountAfterFee(amount: bigint | string | number, fee: number): bigint | null;
  static formatPriceForDisplay(price: bigint | string | number, decimalPlaces?: number): string;
  static createPriceDisplayString(price: bigint | string | number, decimalPlaces?: number): string;
  static calculatePoolPrice(lpTokenReserve: bigint | string | number | BN, lpSolReserve: bigint | string | number | BN): string | null;
}

// ========================= 常量和函数导出 =========================

export declare const FUN100X_PROGRAM_ID: PublicKey;

export declare function getProgramId(network?: NetworkType): PublicKey;

export declare function getDefaultOptions(networkName?: 'MAINNET' | 'DEVNET' | 'LOCALNET'): NetworkConfig;

// ========================= 模块类导出 =========================

export declare class TradingModule implements TradingModule {}
export declare class FastModule implements FastModule {}
export declare class ChainModule implements ChainModule {}
export declare class TokenModule implements TokenModule {}
export declare class ParamModule implements ParamModule {}
export declare class SimulatorModule implements SimulatorModule {}

// 默认导出
export default Fun100xSdk;
