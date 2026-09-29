/**
 * 100x SDK default configuration constants
 */

// Default network configuration
const DEFAULT_NETWORKS = {
  MAINNET: {
    name: 'mainnet-beta',
    network: 'mainnet',
    programId: 'CYzM71ENGdE6Gjx5NWt4r12EbhGX2DnoEua5oWh8xpCz',
    defaultDataSource: 'fast',
    solanaEndpoint: 'https://solana-rpc.100x.fun',
    fastApiUrl: 'https://api.100x.fun/',
    feeRecipient: '3846yjHxwauQpWTfRWZWGy4JRaX1zfb3iT51ubhasFEp',
    baseFeeRecipient: 'E9Tx5Mq44vGDPZWV2ZbupqMT6imLsLoe1C1cQVx9pfXZ',
    paramsAccount: 'A2PoRSyW6FG1jUM8M5HCKqBdyfrLYoE8F16JboRno7hL'
  },
  DEVNET: {
    name: 'devnet',
    network: 'localnet',
    programId: 'EVNaaiyg9z876PUmLCVQcdc5L5eJukT4pni5GtVJ8P37',
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
