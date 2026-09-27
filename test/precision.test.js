const assert = require('assert');
const { formatRatio, ceilDiv } = require('../src/modules/simulator/precision');
const {
  simulateLongStopLoss,
  simulateShortStopLoss,
  simulateLongSolStopLoss,
  simulateShortSolStopLoss,
} = require('../src/modules/simulator/long_shrot_stop');
const SimulatorModule = require('../src/modules/simulator');
const { simulateTokenBuy, simulateTokenSell } = require('../src/modules/simulator/buy_sell_token');

describe('simulator precision', () => {
  it('rounds display values from the original integer ratio', () => {
    assert.strictEqual(formatRatio(1000000000000000000n, 60240963855421687n, 2, 1n, 'half-up', true), '16.6');
    assert.strictEqual(formatRatio(331n, 20n, 2, 1n, 'half-up', true), '16.55');
    assert.strictEqual(formatRatio(332n, 20n, 2, 1n, 'half-up', true), '16.6');
    assert.strictEqual(formatRatio(10n, 1n, 2, 1n, 'half-up', true), '10');
  });

  it('keeps completion and slippage truncation exact across Number boundaries', () => {
    assert.strictEqual(formatRatio(289999999999999999n, 1000000000000000000n, 1, 100n), '28.9');
    assert.strictEqual(formatRatio(290000000000000000n, 1000000000000000000n, 1, 100n), '29.0');
    assert.strictEqual(formatRatio(1n, 3n, 1, 100n), '33.3');
    assert.strictEqual(formatRatio(18446744073709551615n, 18446744073709551616n, 1, 100n), '99.9');
    assert.throws(() => formatRatio(1n, 0n, 1, 100n), RangeError);
  });

  it('calculates the SOL-mode search bound without floating point', () => {
    assert.strictEqual(ceilDiv(30n, 3n), 10n);
    assert.strictEqual(ceilDiv(31n, 3n), 11n);
    assert.strictEqual(ceilDiv(9007199254740993n, 2n), 4503599627370497n);
  });

  it('keeps one-decimal percentage strings for token buy and sell', async () => {
    const context = { sdk: { MAX_ORDERS_COUNT: 50, SUGGEST_LIQ_RATIO: 975 } };
    const orders = { data: { orders: [] } };
    const curve = {
      initialVirtualSol: 30000000000n,
      initialVirtualToken: 1073000000000000000n,
    };
    for (const simulate of [simulateTokenBuy, simulateTokenSell]) {
      const result = await simulate.call(
        context, 'fixture', 1000000000n, null,
        '1000000000000000000', orders, curve,
      );
      assert.strictEqual(result.completion, '100.0');
      assert.strictEqual(result.slippage, '0.0');
    }
  });

  it('returns display leverage for both sides and both amount modes', async () => {
    const currentPrice = 1000000000000000000n;
    const distance = (currentPrice * 5n + 82n) / 83n;
    const orders = { success: true, data: { orders: [] } };
    for (const [simulate, stopLossPrice, amount] of [
      [simulateLongStopLoss, currentPrice - distance, 1000000000n],
      [simulateShortStopLoss, currentPrice + distance, 1000000000n],
      [simulateLongSolStopLoss, currentPrice - distance, 10000000n],
      [simulateShortSolStopLoss, currentPrice + distance, 10000000n],
    ]) {
      const result = await simulate.call(
        {}, 'fixture', amount, stopLossPrice, currentPrice.toString(),
        orders, 2000, '30', '1073000000',
      );
      assert.strictEqual(result.leverage, 16.5999);
      assert.strictEqual(result.leverageDisplay, '16.6');
      assert.strictEqual(result.executableStopLossPrice, stopLossPrice);
      assert.deepStrictEqual(result.close_insert_indices, [65535]);
    }
  });

  it('preserves genuine stop-loss adjustment in the display value', async () => {
    const currentPrice = 1000000000000000000n;
    const requestedStopLoss = currentPrice - currentPrice / 100n; // 1%, below the 4% minimum distance
    const result = await simulateLongStopLoss.call(
      {}, 'fixture', 1000000000n, requestedStopLoss, currentPrice.toString(),
      { success: true, data: { orders: [] } }, 2000, '30', '1073000000',
    );
    assert.notStrictEqual(result.executableStopLossPrice, requestedStopLoss);
    assert.strictEqual(result.leverageDisplay, '25');
  });

  it('computes sell estimate in integer units', async () => {
    const price = 10000000000000000000000n; // 0.1 SOL per token
    const sdk = {
      data: {
        price: async () => price.toString(),
        orders: async () => ({ success: true, data: { orders: [] } }),
      },
    };
    const simulator = new SimulatorModule(sdk);
    simulator.simulateTokenSell = async () => ({ completion: '100.0', slippage: '0.0', liqResult: {} });
    const result = await simulator.simulateSell('fixture', 150n);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.idealSolAmount, 15n);
    assert.strictEqual(result.data.theoreticalSolAmount, 15n);
  });
});
