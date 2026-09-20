# 100x SDK TypeScript 使用指南

## 🎉 TypeScript 支持已完成！

100x SDK 现在提供完整的 TypeScript 类型定义，让你在开发时享受类型安全和智能提示。

## 📦 安装和使用

### 安装
```bash
npm install 100x-sdk
# TypeScript 类型会自动包含，无需额外安装 @types/100x-sdk
```

### 基础使用

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { 
  Fun100xSdk, 
  getDefaultOptions, 
  FUN100X_PROGRAM_ID,
  type Fun100xSdkOptions,
  type BuyParams,
  type OrdersQueryOptions 
} from '100x-sdk';

// 1. 初始化 SDK
const options = getDefaultOptions('DEVNET'); // 类型：NetworkConfig
const connection = new Connection(options.solanaEndpoint);

const sdkOptions: Fun100xSdkOptions = {
  defaultDataSource: 'fast', // 类型安全：只能是 'fast' | 'chain'
  ...options
};

const sdk = new Fun100xSdk(connection, FUN100X_PROGRAM_ID, sdkOptions);

// 2. 使用 SDK 方法（带类型提示）
async function example() {
  // 获取代币信息
  const mintInfo = await sdk.fast.mint_info('your-mint-address');
  // mintInfo 类型：MintInfo
  
  // 获取价格
  const price = await sdk.data.price('your-mint-address');
  // price 类型：PriceResponse
  
  // 查询订单
  const queryOptions: OrdersQueryOptions = {
    type: 'up_orders', // 类型安全：只能是 'up_orders' | 'down_orders'
    limit: 10,
    dataSource: 'fast'
  };
  
  const orders = await sdk.data.orders('your-mint-address', queryOptions);
  // orders 类型：OrdersResponse
}
```

### 交易操作

```typescript
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { 
  type BuyParams, 
  type SellParams, 
  type TransactionResult 
} from '100x-sdk';

async function tradingExample(sdk: Fun100xSdk, payer: PublicKey) {
  // 买入交易
  const buyParams: BuyParams = {
    mintAccount: 'your-mint-address',
    buyTokenAmount: new BN(1000000), // 1 token (6 decimals)
    maxSolAmount: new BN(2000000000), // 2 SOL (9 decimals)
    payer: payer
  };
  
  const buyResult: TransactionResult = await sdk.trading.buy(buyParams);
  // buyResult.transaction 类型：Transaction
  // buyResult.accounts 类型：Record<string, PublicKey>
  
  // 卖出交易
  const sellParams: SellParams = {
    mintAccount: 'your-mint-address',
    sellTokenAmount: new BN(500000), // 0.5 token
    minSolOutput: new BN(1000000000), // 1 SOL minimum
    payer: payer
  };
  
  const sellResult = await sdk.trading.sell(sellParams);
  // 完整类型支持
}
```

### 工具类使用

```typescript
import { 
  OrderUtils, 
  CurveAMM, 
  type OrderData, 
  type LpPair 
} from '100x-sdk';

function utilsExample(orders: OrderData[]) {
  // OrderUtils 方法
  const lpPairs: LpPair[] = OrderUtils.buildLpPairs(
    orders, 
    'up_orders', 
    price, 
    10
  );
  
  const orderAccounts = OrderUtils.buildOrderAccounts(orders, 10);
  // orderAccounts 类型：(string | null)[]
  
  // CurveAMM 方法
  const priceU128 = CurveAMM.decimalToU128(priceDecimal);
  // priceU128 类型：bigint | null
  
  if (priceU128) {
    const buyResult = CurveAMM.buyFromPriceToPrice(
      priceU128, 
      priceU128 * 2n
    );
    // buyResult 类型：[bigint, bigint] | null
  }
}
```

## 🔧 React + TypeScript 示例

```typescript
import React, { useState, useEffect } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { 
  Fun100xSdk, 
  getDefaultOptions,
  type PriceResponse,
  type MintInfo 
} from '100x-sdk';

interface 100xHookResult {
  sdk: Fun100xSdk | null;
  loading: boolean;
  error: string | null;
}

// 自定义 Hook
function useFun100xSdk(): 100xHookResult {
  const [sdk, setSdk] = useState<Fun100xSdk | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initSdk = async () => {
      try {
        const options = getDefaultOptions('DEVNET');
        const connection = new Connection(options.solanaEndpoint);
        
        const spinSdk = new Fun100xSdk(connection, 'your-program-id', {
          ...options,
          defaultDataSource: 'fast'
        });
        
        setSdk(spinSdk);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    initSdk();
  }, []);

  return { sdk, loading, error };
}

// 组件
function TokenInfo({ mint }: { mint: string }) {
  const { sdk, loading, error } = useFun100xSdk();
  const [price, setPrice] = useState<PriceResponse | null>(null);
  const [mintInfo, setMintInfo] = useState<MintInfo | null>(null);

  useEffect(() => {
    if (!sdk) return;

    const fetchData = async () => {
      try {
        const [priceData, tokenInfo] = await Promise.all([
          sdk.data.price(mint),
          sdk.fast.mint_info(mint)
        ]);
        
        setPrice(priceData);
        setMintInfo(tokenInfo);
      } catch (err) {
        console.error('Failed to fetch data:', err);
      }
    };

    fetchData();
  }, [sdk, mint]);

  if (loading) return <div>Loading SDK...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h3>Token Info</h3>
      {mintInfo && (
        <div>
          <p>Name: {mintInfo.name}</p>
          <p>Symbol: {mintInfo.symbol}</p>
          <p>Decimals: {mintInfo.decimals}</p>
        </div>
      )}
      {price && (
        <div>
          <p>Current Price: {price.price}</p>
        </div>
      )}
    </div>
  );
}

export default TokenInfo;
```

## 🛠️ Vite + TypeScript 配置

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    }
  },
  optimizeDeps: {
    include: ['@solana/web3.js', '@coral-xyz/anchor', '100x-sdk', 'buffer']
  }
});
```

## 📝 类型定义概览

### 主要类型
- `Fun100xSdk` - 主 SDK 类
- `DataSourceType` - 数据源类型 `'fast' | 'chain'`
- `NetworkConfig` - 网络配置接口
- `Fun100xSdkOptions` - SDK 选项接口

### 交易相关类型
- `BuyParams`, `SellParams` - 买卖参数
- `LongParams`, `ShortParams` - 保证金交易参数
- `TransactionResult` - 交易结果
- `TransactionOptions` - 交易选项

### 数据相关类型
- `OrderData` - 订单数据
- `OrdersResponse` - 订单查询响应
- `PriceResponse` - 价格查询响应
- `MintInfo` - 代币信息

### 工具类型
- `LpPair` - 流动性配对
- `FindPrevNextResult` - 前后订单查找结果
- `ValidationResult` - 验证结果

## 🔍 类型检查

开发时，TypeScript 编译器会：

✅ **提供智能提示**
- 方法参数自动补全
- 返回值类型推导
- 属性访问提示

✅ **类型安全检查**
- 参数类型验证
- 返回值类型检查
- 属性存在性验证

✅ **编译时错误检测**
- 拼写错误检测
- 类型不匹配警告
- 缺失参数提醒

## 🚀 下一步

1. 在你的 React + Vite + TypeScript 项目中安装 `100x-sdk`
2. 按照上面的示例配置 Vite
3. 导入类型和 SDK，享受完整的类型支持！

现在你可以在开发时享受完整的 TypeScript 类型安全和智能提示了！