// TypeScript 测试文件 - 验证类型定义是否正确
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

// 测试基础类型推导
async function testTypes() {
  // 1. 测试配置获取
  const options = getDefaultOptions('DEVNET');
  console.log('Network config:', options.name); // 应该有类型提示

  // 2. 测试 SDK 初始化
  const connection = new Connection(options.solanaEndpoint);
  const sdkOptions: Fun100xSdkOptions = {
    defaultDataSource: 'fast',
    ...options
  };

  const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, sdkOptions);

  // 3. 测试 SDK 属性和方法
  console.log('Max orders:', sdk.MAX_ORDERS_COUNT); // 应该是 number 类型
  console.log('Data source:', sdk.defaultDataSource); // 应该是 'fast' | 'chain' 类型

  // 4. 测试模块访问
  const mintInfo = await sdk.fast.mint_info('test-mint'); // 应该有类型提示
  const price = await sdk.data.price('test-mint'); // 应该返回 PriceResponse 类型

  // 5. 测试交易参数
  const buyParams: BuyParams = {
    mintAccount: 'test-mint',
    buyTokenAmount: new BN(1000000),
    maxSolAmount: new BN(2000000),
    payer: new PublicKey('11111111111111111111111111111112')
  };

  // 6. 测试交易方法
  const buyResult: TransactionResult = await sdk.trading.buy(buyParams);
  console.log('Transaction:', buyResult.transaction); // 应该是 Transaction 类型
  console.log('Accounts:', buyResult.accounts); // 应该是 Record<string, PublicKey> 类型

  // 7. 测试查询选项
  const queryOptions: OrdersQueryOptions = {
    type: 'up_orders',
    limit: 10,
    dataSource: 'fast'
  };

  const orders = await sdk.data.orders('test-mint', queryOptions);
  console.log('Orders count:', orders.data.orders.length); // 应该是 number 类型

  // 8. 测试工具类方法
  const lpPairs = OrderUtils.buildLpPairs(orders.data.orders, 'up_orders', price, 10);
  console.log('LP pairs:', lpPairs.length); // 应该是 LpPair[] 类型

  // 9. 测试 CurveAMM 静态方法
  const priceU128 = CurveAMM.decimalToU128(price); // 应该返回 bigint | null
  if (priceU128) {
    const priceDecimal = CurveAMM.u128ToDecimal(priceU128); // 应该有类型提示
    console.log('Price conversion successful');
  }

  // 10. 测试模拟器
  const simulation = await sdk.simulator.simulateTokenBuy('test-mint', 1000000);
  console.log('Simulation completion:', simulation.completion); // 应该是 string 类型
}

// 测试错误处理
function testErrorHandling() {
  try {
    // 这应该在编译时报错 - 错误的数据源类型
    // const wrongOptions: Fun100xSdkOptions = {
    //   defaultDataSource: 'wrong-source' // 应该报错
    // };

    // 这应该在编译时报错 - 缺少必需参数
    // const wrongBuyParams: BuyParams = {
    //   mintAccount: 'test-mint'
    //   // 缺少其他必需字段，应该报错
    // };
  } catch (error) {
    console.error('Type error caught:', error);
  }
}

// 导出测试函数以供使用
export { testTypes, testErrorHandling };
