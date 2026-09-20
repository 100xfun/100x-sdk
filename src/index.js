/**
 * 100x SDK
 * SDK for Solana Anchor contracts
 * Modular design providing trading, token management and other features
 */

// Import main SDK class
const Fun100xSdk = require('./sdk');
const idlLocalnet = require('./idl/fun100x_localnet.json');
const idlMain = require('./idl/fun100x_main.json');
const { PublicKey } = require('@solana/web3.js');

// Import modules (optional, users can also access directly via sdk.trading)
const TradingModule = require('./modules/trading');
const TokenModule = require('./modules/token');

// Import configuration utilities
const { getDefaultOptions } = require('./utils/constants');

// Import utility classes
const OrderUtils = require('./utils/orderUtils');
const CurveAMM = require('./utils/curve_amm');

// Program ID constants
const FUN100X_PROGRAM_ID = new PublicKey(idlMain.address);

function getProgramId(network) {
  if (network === 'localnet') return new PublicKey(idlLocalnet.address);
  return new PublicKey(idlMain.address);
}

// Main exports
module.exports = {
  // Main SDK class
  Fun100xSdk,

  // Constants
  FUN100X_PROGRAM_ID,
  getProgramId,

  // Configuration utilities
  getDefaultOptions,

  // Utility classes
  OrderUtils,
  CurveAMM,

  // Default export SDK class
  default: Fun100xSdk,
};
