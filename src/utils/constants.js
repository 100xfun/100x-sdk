/**
 * 100x SDK default configuration constants
 */

// Default network configuration
const DEFAULT_NETWORKS = {
  MAINNET: {
    name: 'mainnet-beta',
    network: 'mainnet',
    programId: 'sGecRTjTZmnqJBmLK4ZMNCzsaMrgkFfNqEcYk1GhRde',
    defaultDataSource: 'fast',
    solanaEndpoint: 'https://solana-rpc.100x.fun',
    fastApiUrl: 'https://api.100x.fun/',
    feeRecipient: 'CmDe8JRAPJ7QpZNCb4ArVEyzyxYoCNL7WZw5qXLePULn',
    baseFeeRecipient: '2xhAfEfnH8wg7ZGujSijJi4Zt4ge1ZuwMypo7etntgXA',
    paramsAccount: 'CJSn3n4MVCg4qWQ7qb2nxzosYwfcRyBvmwhtM77ugu1V'
  },
  DEVNET: {
    name: 'devnet',
    network: 'localnet',
    programId: 'sGecRTjTZmnqJBmLK4ZMNCzsaMrgkFfNqEcYk1GhRde',
    defaultDataSource: 'fast',
    solanaEndpoint: 'https://lu-ura5lv-fast-devnet.helius-rpc.com',
    fastApiUrl: 'https://devtestapi.100x.fun',
    feeRecipient: 'GesAj2dTn2wdNcxj4x8qsqS9aNRVPBPkE76aaqg7skxu',
    baseFeeRecipient: '5YHi1HsxobLiTD6NQfHJQpoPoRjMuNyXp4RroTvR6dKi',
    paramsAccount: 'Ckz5CmbpyKtKmwgw7NDLzFnVACxekWqrX8i6vhCyLkqY'
  },
  LOCALNET: {
    name: 'localnet',
    network: 'localnet',
    programId: 'EVNaaiyg9z876PUmLCVQcdc5L5eJukT4pni5GtVJ8P37',
    defaultDataSource: 'fast', // 'fast' or 'chain'
    solanaEndpoint: 'http://127.0.0.1:8899',
    fastApiUrl: 'http://127.0.0.1:3000',
    feeRecipient: 'GesAj2dTn2wdNcxj4x8qsqS9aNRVPBPkE76aaqg7skxu',
    baseFeeRecipient: '5YHi1HsxobLiTD6NQfHJQpoPoRjMuNyXp4RroTvR6dKi',
    paramsAccount: 'HPuvtLLcgSMPSyRmULPiFe9oAvm1o8mR4weqXZrUhzRM'
  }
};



// Get default configuration
function getDefaultOptions(networkName = 'LOCALNET') {
  const networkConfig = DEFAULT_NETWORKS[networkName];

  return {
    ...networkConfig
  };
}

module.exports = {
  getDefaultOptions
};
