/**
 * 诊断 Program ID 问题
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Fun100xSdk, getDefaultOptions, FUN100X_PROGRAM_ID } = require('./src/index');
const fun100xIdl = require('./src/idl/fun100x_main.json');

async function diagnose() {
  console.log('=== Program ID 诊断 ===\n');

  // 1. 检查 IDL 配置
  console.log('1. IDL 配置:');
  console.log('   IDL Address:', fun100xIdl.address);
  console.log('   IDL Metadata:', JSON.stringify(fun100xIdl.metadata, null, 2));

  // 2. 检查 SDK 导出的 ID
  console.log('\n2. SDK 导出:');
  console.log('   FUN100X_PROGRAM_ID:', FUN100X_PROGRAM_ID.toString());
  console.log('   类型:', FUN100X_PROGRAM_ID.constructor.name);

  // 3. 检查本地网络部署
  const options = getDefaultOptions('LOCALNET');
  const connection = new Connection(options.solanaEndpoint, 'confirmed');

  console.log('\n3. 网络配置:');
  console.log('   RPC URL:', options.solanaEndpoint);

  try {
    const accountInfo = await connection.getAccountInfo(FUN100X_PROGRAM_ID);
    console.log('\n4. 链上程序状态:');
    if (accountInfo) {
      console.log('   ✅ 程序已部署');
      console.log('   Owner:', accountInfo.owner.toString());
      console.log('   可执行:', accountInfo.executable);
      console.log('   数据长度:', accountInfo.data.length, 'bytes');
    } else {
      console.log('   ❌ 程序未部署到此网络');
    }
  } catch (error) {
    console.log('   ❌ 无法连接到网络:', error.message);
  }

  // 4. 问题分析
  console.log('\n5. 问题分析:');
  console.log('   错误 0x1004 = DeclaredProgramIdMismatch');
  console.log('   这意味着程序源代码中的 declare_id! 与部署地址不匹配\n');

  console.log('=== 解决方案 ===\n');
  console.log('如果你有程序源代码，需要:');
  console.log('1. 检查 programs/fun100x/src/lib.rs 中的 declare_id!');
  console.log('2. 确保它声明的是:', FUN100X_PROGRAM_ID.toString());
  console.log('3. 重新构建并部署:');
  console.log('   anchor build');
  console.log('   anchor deploy\n');

  console.log('如果没有源代码访问权限:');
  console.log('1. 联系程序开发者重新部署正确版本');
  console.log('2. 或者使用已正确部署的其他网络（devnet/mainnet）\n');
}

diagnose().catch(console.error);
