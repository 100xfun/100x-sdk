const { Connection, PublicKey } = require('@solana/web3.js');
const Fun100xSdk = require('../src/sdk');

/**
 * Example of configuring the 100x SDK
 * Demonstrates how to use the default configuration system
 */

// Example 1: Minimal configuration - use all defaults
async function basicUsage() {
  console.log('=== 基础使用示例 ===');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = /* Your wallet instance */;
  const programId = 'YourProgramIdHere';

  // Provide only the required account settings; use defaults for everything else
  const sdk = new Fun100xSdk(connection, wallet, programId, {
    fee_recipient: 'YourFeeRecipientPublicKey',
    base_fee_recipient: 'YourBaseFeeRecipientPublicKey',
    params_account: 'YourParamsAccountPublicKey'
  });

  // Check the configuration status
  console.log('配置状态:', sdk.getConfigStatus());
  console.log('是否已配置:', sdk.isConfigured());
}

// Example 2: Custom configuration - override defaults
async function customConfiguration() {
  console.log('=== 自定义配置示例 ===');

  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const wallet = /* Your wallet instance */;
  const programId = 'YourProgramIdHere';

  // Customize the configuration and override defaults
  const sdk = new Fun100xSdk(connection, wallet, programId, {
    // Required settings
    fee_recipient: 'YourFeeRecipientPublicKey',
    base_fee_recipient: 'YourBaseFeeRecipientPublicKey',
    params_account: 'YourParamsAccountPublicKey',

    // Custom network settings
    commitment: 'finalized',
    preflightCommitment: 'finalized',

    // Custom timeout and retry settings
    timeout: 120000, // 2 minutes
    maxRetries: 5,
    retryDelay: 2000, // 2 seconds

    // Custom API URL
    fastApiUrl: 'https://custom-api.example.com',

    // Disable strict validation
    strictValidation: false
  });

  console.log('当前配置:', sdk.getConfig());
  console.log('网络信息:', sdk.getNetworkInfo());
}

// Example 3: Update the configuration dynamically
async function dynamicConfiguration() {
  console.log('=== 动态配置更新示例 ===');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = /* Your wallet instance */;
  const programId = 'YourProgramIdHere';

  // Initial configuration
  const sdk = new Fun100xSdk(connection, wallet, programId, {
    fee_recipient: 'YourFeeRecipientPublicKey',
    base_fee_recipient: 'YourBaseFeeRecipientPublicKey',
    params_account: 'YourParamsAccountPublicKey'
  });

  console.log('初始配置状态:', sdk.getConfigStatus());

  // Update the configuration
  sdk.updateConfig({
    commitment: 'finalized',
    maxRetries: 10,
    fastApiUrl: 'https://new-api.example.com'
  });

  console.log('更新后配置:', sdk.getConfig());

  // Reset to the default configuration
  sdk.resetToDefaults();
  console.log('重置后配置状态:', sdk.getConfigStatus());
}

// Example 4: Environment-specific configuration
async function environmentSpecificConfiguration() {
  console.log('=== 环境特定配置示例 ===');

  const environment = process.env.NODE_ENV || 'development';

  // Select a configuration based on the environment
  const envConfigs = {
    development: {
      commitment: 'confirmed',
      maxRetries: 3,
      timeout: 60000,
      fastApiUrl: 'https://devtestapi.pinpet.fun'
    },
    production: {
      commitment: 'finalized',
      maxRetries: 5,
      timeout: 120000,
      fastApiUrl: 'https://api.pinpet.fun'
    },
    testing: {
      commitment: 'processed',
      maxRetries: 1,
      timeout: 30000,
      strictValidation: false
    }
  };

  const connection = new Connection(
    environment === 'production'
      ? 'https://api.mainnet-beta.solana.com'
      : 'https://api.devnet.solana.com'
  );

  const wallet = /* Your wallet instance */;
  const programId = 'YourProgramIdHere';

  const sdk = new Fun100xSdk(connection, wallet, programId, {
    fee_recipient: 'YourFeeRecipientPublicKey',
    base_fee_recipient: 'YourBaseFeeRecipientPublicKey',
    params_account: 'YourParamsAccountPublicKey',
    ...envConfigs[environment]
  });

  console.log(`${environment} 环境配置:`, sdk.getConfig());
}

// Example 5: Configuration validation and error handling
async function configurationValidation() {
  console.log('=== 配置验证示例 ===');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = /* Your wallet instance */;
  const programId = 'YourProgramIdHere';

  try {
    // Intentionally use an incomplete configuration to demonstrate validation
    const sdk = new Fun100xSdk(connection, wallet, programId, {
      // Required account settings are missing
      fastApiUrl: 'invalid-url' // Invalid URL
    });

    // Check the configuration status
    const status = sdk.getConfigStatus();
    if (!status.isConfigured) {
      console.log('SDK 未完全配置，缺少以下配置:');
      if (!status.accounts.feeRecipient) console.log('- fee_recipient');
      if (!status.accounts.baseFeeRecipient) console.log('- base_fee_recipient');
      if (!status.accounts.paramsAccount) console.log('- params_account');
    }

  } catch (error) {
    console.error('配置错误:', error.message);
  }
}

// Export the example functions
module.exports = {
  basicUsage,
  customConfiguration,
  dynamicConfiguration,
  environmentSpecificConfiguration,
  configurationValidation
};

// Run all examples when this file is executed directly
if (require.main === module) {
  console.log('100x SDK 配置使用示例\n');

  // Note: These examples require a real wallet and program ID to run
  // Update the configuration values to match your setup

  console.log('请查看代码中的示例函数，了解如何使用默认配置系统。');
  console.log('要运行示例，请提供真实的钱包实例和程序ID。');
}
