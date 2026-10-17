# Constants and helpers

## Network presets and program IDs

```js
const { getDefaultOptions, getProgramId, FUN100X_PROGRAM_ID } = require('100x-sdk');
const mainnet = getDefaultOptions('MAINNET');
const devnet = getDefaultOptions('DEVNET');
const localnet = getDefaultOptions('LOCALNET');
const defaultOptions = getDefaultOptions(); // LOCALNET
const programId = getProgramId(mainnet.network);
```

`getDefaultOptions()` reads the presets in [`src/utils/constants.js`](../src/utils/constants.js). The preset names are case sensitive. Each returned object contains `name`, `network`, `programId`, `defaultDataSource`, `solanaEndpoint`, `fastApiUrl`, `feeRecipient`, `baseFeeRecipient`, and `paramsAccount`. All current presets use `defaultDataSource: 'fast'`. `DEVNET` uses `network: 'localnet'` and the localnet program ID/IDL; its RPC and API URLs differ from `LOCALNET`. Refer to the source for the current endpoint and account addresses rather than copying them into an application.

`FUN100X_PROGRAM_ID` is a `PublicKey` for the mainnet IDL address. `getProgramId('localnet')` returns the localnet IDL address; any other input returns mainnet. Use the preset's `network` field to choose the correct IDL and program ID.

The SDK instance sets `MAX_ORDERS_COUNT = 50`, `FIND_MAX_ORDERS_COUNT = 1000`, and `SUGGEST_LIQ_RATIO = 975` (97.5% on a denominator of 1000). These are instance properties, not named package exports.

## Precision

| Quantity | Factor | Example |
| --- | --- | --- |
| SOL | `10^9` lamports | `1000000000` = 1 SOL |
| Protocol token | `10^9` smallest units | `1000000000` = 1 token at 9 decimals |
| Price | `10^23` raw u128 units | `CurveAMM.u128ToDecimal(rawPrice)` |

The curve code uses `10^9` for tokens and SOL. For a token displayed from an on chain mint, read its actual `decimals` from `sdk.chain.getCurveAccount(mint)` instead of assuming all SPL mints have the same decimals. Avoid JavaScript `number` for large raw amounts; retain strings, `bigint`, or `anchor.BN`.

`CurveAMM` is exported from the package and available as `sdk.curve` or `Fun100xSdk.CurveAMM`:

```js
const { CurveAMM } = require('100x-sdk');
const Decimal = require('decimal.js');
const decimalPrice = CurveAMM.u128ToDecimal(rawPrice); // Decimal
const rawAgain = CurveAMM.decimalToU128(new Decimal(decimalPrice)); // bigint | null
const tokenUnits = CurveAMM.tokenDecimalToU64(new Decimal('1.5')); // bigint | null
const solUnits = CurveAMM.solDecimalToU64(new Decimal('0.25')); // bigint | null
```

`decimalToU128`, `tokenDecimalToU64`, and `solDecimalToU64` take Decimal values and round down; their `Ceil` variants round up. Conversion can return `null` for an out of range value. `CurveAMM` also has AMM calculation methods, including `buyFromPriceToPrice`, `sellFromPriceToPrice`, and `*WithParams` variants for pools with custom initial virtual reserves. Those calculations return `[solAmount, tokenAmount]` or `null`; use the current curve's `initialVirtualSol` and `initialVirtualToken` for custom pools.

`CurveAMM.calculateAmountAfterFee(amount, fee)` and `calculateTotalAmountWithFee(amount, fee)` use a denominator of `100000`: a fee value of `2000` means 2%. Both return a `bigint` or `null`. The current helper caps accepted fee values at `10000` (10%).

`OrderUtils` is exported but its class body is empty in the current implementation. Do not call helper methods listed in [`src/types/index.d.ts`](../src/types/index.d.ts) as if they exist at runtime.
