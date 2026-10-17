// TypeScript test file for verifying type definitions
import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import {
  Fun100xSdk,
  getDefaultOptions,
  FUN100X_PROGRAM_ID,
  OrderUtils,
  CurveAMM,
  type Fun100xSdkOptions,
  type BuyParams,
  type OrdersQueryOptions,
  type TransactionResult
} from '100x-sdk';

// Test basic type inference
async function testTypes() {
  // 1. Test configuration retrieval
  const options = getDefaultOptions('DEVNET');
  console.log('Network config:', options.name); // Should provide type hints

  // 2. Test SDK initialization
  const connection = new Connection(options.solanaEndpoint);
  const sdkOptions: Fun100xSdkOptions = {
    defaultDataSource: 'fast',
    ...options
  };

  const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, sdkOptions);

  // 3. Test SDK properties and methods
  console.log('Max orders:', sdk.MAX_ORDERS_COUNT); // Should be of type number
  console.log('Data source:', sdk.defaultDataSource); // Should be of type 'fast' | 'chain'

  // 4. Test module access
  const mintInfo = await sdk.fast.mint_info('test-mint'); // Should provide type hints
  const price = await sdk.data.price('test-mint'); // Should return a PriceResponse

  // 5. Test transaction parameters
  const buyParams: BuyParams = {
    mintAccount: 'test-mint',
    buyTokenAmount: new BN(1000000),
    maxSolAmount: new BN(2000000),
    payer: new PublicKey('11111111111111111111111111111112')
  };

  // 6. Test trading methods
  const buyResult: TransactionResult = await sdk.trading.buy(buyParams);
  console.log('Transaction:', buyResult.transaction); // Should be of type Transaction
  console.log('Accounts:', buyResult.accounts); // Should be of type Record<string, PublicKey>

  // 7. Test query options
  const queryOptions: OrdersQueryOptions = {
    type: 'up_orders',
    limit: 10,
    dataSource: 'fast'
  };

  const orders = await sdk.data.orders('test-mint', queryOptions);
  console.log('Orders count:', orders.data.orders.length); // Should be of type number

  // 8. Test utility class methods
  const lpPairs = OrderUtils.buildLpPairs(orders.data.orders, 'up_orders', price, 10);
  console.log('LP pairs:', lpPairs.length); // Should be of type LpPair[]

  // 9. Test CurveAMM static methods
  const priceU128 = CurveAMM.decimalToU128(price); // Should return bigint | null
  if (priceU128) {
    const priceDecimal = CurveAMM.u128ToDecimal(priceU128); // Should provide type hints
    console.log('Price conversion successful');
  }

  // 10. Test the simulator
  const simulation = await sdk.simulator.simulateTokenBuy('test-mint', 1000000);
  console.log('Simulation completion:', simulation.completion); // Should be of type string
}

// Test error handling
function testErrorHandling() {
  try {
    // This should cause a compile-time error: invalid data source type
    // const wrongOptions: Fun100xSdkOptions = {
    //   defaultDataSource: 'wrong-source' // Should cause an error
    // };

    // This should cause a compile-time error: missing required parameters
    // const wrongBuyParams: BuyParams = {
    //   mintAccount: 'test-mint'
    //   // Other required fields are missing; this should cause an error
    // };
  } catch (error) {
    console.error('Type error caught:', error);
  }
}

// Export test functions for use elsewhere
export { testTypes, testErrorHandling };
