const assert = require('assert');
const { readFileSync } = require('fs');
const path = require('path');
const vm = require('vm');
const { Connection } = require('@solana/web3.js');

const curve = { initialVirtualSol: 30000000000n, initialVirtualToken: 1030080000000000000n };
const order = { order_id: '2', lock_lp_start_price: '3634051707450309',
  lock_lp_end_price: '3619550316981105', lock_lp_sol_amount: '66928965',
  lock_lp_token_amount: '1845403110626612', next_lp_token_amount: '3000000000000000000' };

// Offline: supplied snapshots prevent every RPC/data read; never sign or submit.
async function check(api) {
  const sdk = new api.Fun100xSdk(new Connection('http://127.0.0.1:8899'),
    api.getProgramId('localnet'), { network: 'localnet', defaultDataSource: 'chain' });
  sdk.data.price = sdk.data.orders = sdk.chain.getCurveAccount = async () => {
    throw new Error('Unexpected network read');
  };
  for (const [amount, pass, expected] of [[12081048965507299n, null, 431810511n],
    [1845403110626612n, '2', 66952532n]]) {
    const r = await sdk.simulator.simulateTokenSell('fixture', amount, pass,
      '3635332675403634', { data: { orders: [order] } }, curve);
    assert.strictEqual(r.completion, '100.0');
    assert.strictEqual(r.liqResult.real_lp_sol_amount, expected);
  }
  const buy = await sdk.simulator.simulateTokenBuy('fixture', 1000000000n, null,
    '1000000000000000000', { data: { orders: [] } }, curve);
  assert.strictEqual(buy.completion, '100.0');
  assert(buy.liqResult.real_lp_sol_amount > 0n);
  for (const method of ['buy', 'sell', 'long', 'short', 'closeLong', 'closeShort']) {
    assert.strictEqual(typeof sdk.trading[method], 'function');
  }
}

describe('built SDK public entries (run npm run build first)', () => {
  it('CJS package entry', async () => check(require('../..')));
  it('ESM entry', async () => check(await import('../../dist/100x-sdk.esm.js')));
  it('UMD entry with the existing browser globals', async () => {
    const browser = { solanaWeb3: require('@solana/web3.js'), anchor: require('@coral-xyz/anchor'),
      console, TextEncoder, TextDecoder, Buffer, URL, URLSearchParams, setTimeout, clearTimeout };
    browser.global = browser; // Existing bundle requires a global alias for its Buffer polyfill.
    vm.runInNewContext(readFileSync(path.resolve(__dirname, '../../dist/100x-sdk.js'), 'utf8'), browser);
    await check(browser.Fun100xSDK.default);
  });
});
