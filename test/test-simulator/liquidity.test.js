const assert = require('assert');
const { calcLiqTokenBuy, calcLiqTokenSell } = require('../../src/modules/simulator/calcLiq');
const { simulateTokenBuy, simulateTokenSell } = require('../../src/modules/simulator/buy_sell_token');
const SimulatorModule = require('../../src/modules/simulator');
const CurveAMM = require('../../src/utils/curve_amm');

const U = 1000000000n;
const P = 10n ** 23n;
const params = [100n * U, 100n * U];
const context = { sdk: { MAX_ORDERS_COUNT: 50, SUGGEST_LIQ_RATIO: 975 } };
const sides = [
  { name: 'buy', calc: calcLiqTokenBuy, simulate: simulateTokenBuy, gap: 20n * U,
    start: P * 25n / 16n, end: P * 4n, sol: 75n * U, token: 30n * U,
    startSol: 125n * U, startToken: 80n * U, endSol: 200n * U, endToken: 50n * U },
  { name: 'sell', calc: calcLiqTokenSell, simulate: simulateTokenSell, gap: 25n * U,
    start: P * 16n / 25n, end: P / 4n, sol: 30n * U, token: 75n * U,
    startSol: 80n * U, startToken: 125n * U, endSol: 50n * U, endToken: 200n * U },
];
function order(side, extra = {}) {
  return { order_id: '2', lock_lp_start_price: String(side.start),
    lock_lp_end_price: String(side.end), lock_lp_sol_amount: String(side.sol),
    lock_lp_token_amount: String(side.token), ...extra };
}
// Independent integer xy=k oracle: all fixture boundary reserves are exact integers.
function quote(side, sol, token, amount) {
  if (side.name === 'sell') return sol * amount / (token + amount);
  return (sol * amount + token - amount - 1n) / (token - amount);
}
function calc(side, amount, orders = [order(side)], pass = null, limit = 50) {
  return side.calc(P, amount, orders, limit, pass, ...params);
}

const incident = {
  price: 3635332675403634n,
  params: [30000000000n, 1030080000000000000n],
  spot: 12081048965507299n,
  long: 1845403110626612n,
  order: { order_id: '2', lock_lp_start_price: '3634051707450309',
    lock_lp_end_price: '3619550316981105', lock_lp_sol_amount: '66928965',
    lock_lp_token_amount: '1845403110626612', next_lp_token_amount: '3000000000000000000' },
};

describe('token liquidity regression', () => {
  for (const side of sides) {
    describe(side.name, () => {
      it('quotes no orders and a partial gap using the supplied pool', () => {
        const expected = quote(side, 100n * U, 100n * U, U);
        assert.strictEqual(calc(side, U, []).real_lp_sol_amount, expected);
        assert.strictEqual(calc(side, U).real_lp_sol_amount, expected);
      });
      it('never releases an order for a missing or unmatched passOrder', () => {
        for (const pass of [null, undefined, '3']) {
          const result = calc(side, U, [order(side)], pass);
          assert.strictEqual(result.pass_order_id, -1);
          assert.strictEqual(result.lock_lp_token_amount_sum, side.token);
        }
      });
      it('matches stable IDs (including zero and large IDs) and legacy PDA values', () => {
        for (const [id, pass] of [['2', '2'], ['2', 2], ['2', 2n], ['0', 0],
          ['0', '0'], ['9007199254740993', 9007199254740993n]]) {
          const result = calc(side, U, [order(side, { order_id: id })], pass);
          assert.strictEqual(result.pass_order_id, 0);
          assert.strictEqual(result.lock_lp_token_amount_sum, 0n);
        }
        const legacy = order(side, { order_id: undefined, order_pda: 'legacy-pda' });
        assert.strictEqual(calc(side, U, [legacy], 'legacy-pda').pass_order_id, 0);
        assert.strictEqual(calc(side, U, [legacy], null).pass_order_id, -1);
      });
      it('rejects rounded numeric IDs and amounts instead of matching the wrong order', () => {
        assert.throws(() => calc(side, U, [], Number.MAX_SAFE_INTEGER + 1), /safe integer/);
        assert.throws(() => calc(side, Number.MAX_SAFE_INTEGER + 1), /safe integer/);
        assert.throws(() => calc(side, U, [order(side, { order_id: Number.MAX_SAFE_INTEGER + 1 })], '2'), /safe integer/);
      });
      it('quotes the exact gap boundary without requiring another order', () => {
        const result = calc(side, side.gap, [order(side), order(side)], null, 1);
        assert.strictEqual(result.real_lp_sol_amount, quote(side, 100n * U, 100n * U, side.gap));
        assert.strictEqual(result.force_close_num, 0);
        assert.strictEqual(result.has_infinite_lp, false);
      });
      it('starts inside a skipped order after accounting for the preceding gap', () => {
        const amount = side.gap + 10n * U;
        const expected = quote(side, 100n * U, 100n * U, side.gap)
          + quote(side, side.startSol, side.startToken, 10n * U);
        assert.strictEqual(calc(side, amount, [order(side)], '2').real_lp_sol_amount, expected);
      });
      it('includes earlier gaps when quoting the tail after a locked order', () => {
        const expected = quote(side, 100n * U, 100n * U, side.gap)
          + quote(side, side.endSol, side.endToken, U);
        const result = calc(side, side.gap + U);
        assert.strictEqual(result.real_lp_sol_amount, expected);
        assert.strictEqual(result.force_close_num, 1);
        assert.strictEqual(result.pass_order_id, -1);
      });
      it('does not invent tail liquidity when the traversal limit is reached', async () => {
        const orders = [order(side), order(side)];
        const result = calc(side, side.gap + U, orders, null, 1);
        assert.strictEqual(result.real_lp_sol_amount, 0n);
        assert.strictEqual(result.has_infinite_lp, false);
        const sim = await side.simulate.call({ sdk: { ...context.sdk, MAX_ORDERS_COUNT: 1 } },
          'fixture', side.gap + U, null, P.toString(), { data: { orders } },
          { initialVirtualSol: params[0], initialVirtualToken: params[1] });
        assert.notStrictEqual(sim.completion, '100.0');
        assert.strictEqual(sim.liqResult.real_lp_sol_amount, 0n);
        assert(BigInt(sim.suggestedSolAmount) > 0n);
        assert(BigInt(sim.suggestedTokenAmount) < side.gap);
      });
      it('accumulates several gaps and skips a non-first stable order ID', () => {
        const buy = side.name === 'buy';
        const nextGap = (buy ? 10n : 50n) * U;
        const second = {
          order_id: '9', index: 41,
          lock_lp_start_price: String(buy ? P * 25n / 4n : P * 4n / 25n),
          lock_lp_end_price: String(buy ? P * 16n : P / 16n),
          lock_lp_sol_amount: String((buy ? 150n : 15n) * U),
          lock_lp_token_amount: String((buy ? 15n : 150n) * U),
        };
        const prefix = quote(side, 100n * U, 100n * U, side.gap)
          + quote(side, side.endSol, side.endToken, nextGap);
        const amount = side.gap + nextGap + U;
        const tail = calc(side, amount, [order(side), second]);
        assert.strictEqual(tail.real_lp_sol_amount, prefix
          + quote(side, (buy ? 400n : 25n) * U, (buy ? 25n : 400n) * U, U));
        assert.strictEqual(tail.force_close_num, 2);
        const skip = calc(side, amount, [order(side), second], '9');
        assert.strictEqual(skip.real_lp_sol_amount, prefix
          + quote(side, (buy ? 250n : 40n) * U, (buy ? 40n : 250n) * U, U));
        assert.strictEqual(skip.pass_order_id, 1); // Array position, not stable ID or slot.
        assert.strictEqual(skip.force_close_num, 1);
      });
      it('isolates dynamic pool parameters across interleaved calls', () => {
        for (const scale of [1n, 4n, 1n]) {
          const scaled = order(side, { lock_lp_sol_amount: String(side.sol * scale),
            lock_lp_token_amount: String(side.token * scale) });
          const r = side.calc(P, (side.gap + U) * scale, [scaled], 50, null,
            params[0] * scale, params[1] * scale);
          assert.strictEqual(r.real_lp_sol_amount,
            quote(side, 100n * U * scale, 100n * U * scale, side.gap * scale)
            + quote(side, side.endSol * scale, side.endToken * scale, U * scale));
        }
      });
      it('rejects negative and overflowing token quantities', () => {
        for (const amount of [-1n, 18446744073709551616n]) {
          assert.throws(() => calc(side, amount), /u64/);
        }
      });
      it('keeps legacy default-curve no-order quotes', () => {
        const price = 10n ** 18n;
        const legacy = side.name === 'buy' ? CurveAMM.buyFromPriceWithTokenOutput : CurveAMM.sellFromPriceWithTokenInput;
        const result = side.calc(price, U, [], 50, null, 30000000000n, 1073000000000000000n);
        assert.strictEqual(result.real_lp_sol_amount, legacy.call(CurveAMM, price, U)[1]);
      });
    });
  }
  it('recovers the incident spot and long quotes without changing global curve constants', async () => {
    const before = CurveAMM.MIN_U128_PRICE;
    for (const [amount, pass] of [[incident.spot, null], [incident.long, '2']]) {
      const result = await simulateTokenSell.call(context, 'fixture', amount, pass,
        incident.price.toString(), { data: { orders: [incident.order] } },
        { initialVirtualSol: incident.params[0], initialVirtualToken: incident.params[1] });
      assert.strictEqual(result.completion, '100.0');
      // Frozen reference from independent Python Decimal (80 digits), xy=k and integer rounding.
      assert.strictEqual(result.liqResult.real_lp_sol_amount, pass === null ? 431810511n : 66952532n);
      assert.strictEqual(result.liqResult.pass_order_id, pass === null ? -1 : 0);
      assert.strictEqual(result.suggestedTokenAmount, amount.toString());
      assert.strictEqual(result.suggestedSolAmount, result.liqResult.real_lp_sol_amount.toString());
    }
    assert.strictEqual(CurveAMM.MIN_U128_PRICE, before);
  });
  it('quotes a low-price empty orderbook with consistent available amounts', () => {
    const r = calcLiqTokenSell(incident.price, incident.spot, [], 50, null, ...incident.params);
    assert(r.free_lp_token_amount_sum >= incident.spot);
    assert(r.free_lp_sol_amount_sum >= r.real_lp_sol_amount);
    assert(r.real_lp_sol_amount > 0n);
  });
  it('honors an explicit finite tail capacity', () => {
    const side = sides[1];
    const r = calc(side, side.gap + 2n * U, [order(side, { next_lp_token_amount: U.toString() })]);
    assert.strictEqual(r.real_lp_sol_amount, 0n);
    assert.strictEqual(r.free_lp_token_amount_sum, side.gap + U);
  });
  it('keeps zero-capacity tails unavailable and rejects malformed capacities', () => {
    const side = sides[1];
    const empty = calc(side, side.gap + U, [order(side, { next_lp_token_amount: '0' })]);
    assert.strictEqual(empty.real_lp_sol_amount, 0n);
    assert.strictEqual(empty.free_lp_token_amount_sum, side.gap);
    for (const capacity of ['-1', '18446744073709551616', Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => calc(side, side.gap + U, [order(side, { next_lp_token_amount: capacity })]), /u64|safe integer/);
    }
  });
  it('keeps simulateSell output and the existing fee-helper rounding', async () => {
    const simulator = new SimulatorModule({ ...context.sdk,
      data: { price: async () => incident.price.toString(), orders: async () => ({ data: { orders: [incident.order] } }) },
      chain: { getCurveAccount: async () => ({ initialVirtualSol: incident.params[0], initialVirtualToken: incident.params[1] }) },
    });
    const r = await simulator.simulateSell('fixture', incident.spot);
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.data.transactionCompletionRate, 100);
    assert(r.data.actualObtainedSolAmount > 0n);
    const feeAdjusted = CurveAMM.calculateAmountAfterFee(r.data.actualObtainedSolAmount, 1000);
    assert.strictEqual(feeAdjusted, r.data.actualObtainedSolAmount - r.data.actualObtainedSolAmount * 1000n / 100000n);
  });
});
