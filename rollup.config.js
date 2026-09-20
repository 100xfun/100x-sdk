const { nodeResolve } = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const replace = require('@rollup/plugin-replace');
const terser = require('@rollup/plugin-terser');
const json = require('@rollup/plugin-json');
const nodePolyfills = require('rollup-plugin-polyfill-node');
const { copyFileSync, existsSync } = require('fs');
const { resolve } = require('path');

// 环境变量
const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

// 自定义插件：复制 TypeScript 声明文件
const copyTypes = () => ({
  name: 'copy-types',
  generateBundle() {
    const sourceTypesPath = resolve(__dirname, 'src/types/index.d.ts');
    const targetTypesPath = resolve(__dirname, 'dist/index.d.ts');

    if (existsSync(sourceTypesPath)) {
      copyFileSync(sourceTypesPath, targetTypesPath);
      console.log('✅ TypeScript declaration file copied to dist/index.d.ts');
    } else {
      console.warn('⚠️  TypeScript declaration file not found at src/types/index.d.ts');
    }
  }
});

// 自定义插件：为模块添加命名导出
const addNamedExports = () => ({
  name: 'add-named-exports',
  renderChunk(code, _chunk, options) {
    if (options.format === 'es') {
      // 在文件末尾添加命名导出 - 直接从 src 对象解构导出
      const namedExports = `
// Re-export all named exports for ESM compatibility
const { Fun100xSdk: _Fun100xSdk, FUN100X_PROGRAM_ID: _FUN100X_PROGRAM_ID, getProgramId: _getProgramId, getDefaultOptions: _getDefaultOptions, OrderUtils: _OrderUtils, CurveAMM: _CurveAMM } = src;
export { _Fun100xSdk as Fun100xSdk, _FUN100X_PROGRAM_ID as FUN100X_PROGRAM_ID, _getProgramId as getProgramId, _getDefaultOptions as getDefaultOptions, _OrderUtils as OrderUtils, _CurveAMM as CurveAMM };
`;
      return code + namedExports;
    } else if (options.format === 'cjs') {
      // 为 CJS 添加命名导出 - 直接从 src 对象中提取
      const namedExports = `
// Re-export all named exports for CJS compatibility
exports.Fun100xSdk = src.Fun100xSdk || src.default;
exports.FUN100X_PROGRAM_ID = src.FUN100X_PROGRAM_ID;
exports.getProgramId = src.getProgramId;
exports.getDefaultOptions = src.getDefaultOptions;
exports.OrderUtils = src.OrderUtils;
exports.CurveAMM = src.CurveAMM;
`;
      return code + namedExports;
    }
    return code;
  }
});

// Rollup配置
module.exports = [
  // CommonJS (适用于Node.js)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/100x-sdk.cjs.js',
      format: 'cjs',
      name: 'Fun100xSDK',
      exports: 'named',
      sourcemap: !isProd,
    },
    external: ['@solana/web3.js', '@coral-xyz/anchor', 'fs', 'path'],
    plugins: [
      json(),
      nodeResolve({
        preferBuiltins: true,
        browser: false,
      }),
      commonjs(),
      replace({
        'process.env.NODE_ENV': JSON.stringify(env),
        preventAssignment: true,
      }),
      addNamedExports(),
      isProd && terser(),
      copyTypes(),
    ].filter(Boolean),
  },

  // ESM (适用于现代浏览器和构建工具)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/100x-sdk.esm.js',
      format: 'es',
      sourcemap: !isProd,
      preserveModules: false,
      interop: 'auto',
    },
    external: ['@solana/web3.js', '@coral-xyz/anchor'],
    plugins: [
      json(),
      replace({
        'process.env.NODE_ENV': JSON.stringify(env),
        // 浏览器环境标识
        'typeof process !== \'undefined\' && process.versions && process.versions.node': 'false',
        // 修复 global 变量问题
        'typeof global !== "undefined" ? global : typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : {}': 'globalThis',
        preventAssignment: true,
      }),
      nodePolyfills({
        include: ['buffer', 'process', 'util', 'path', 'fs'],
        globals: {
          global: false,
          __filename: false,
          __dirname: false,
        },
      }),
      nodeResolve({
        preferBuiltins: false,
        browser: true,
        exportConditions: ['browser'],
      }),
      commonjs({
        include: ['node_modules/**', 'src/**'],
        transformMixedEsModules: true,
        defaultIsModuleExports: true,
        esmExternals: true,
      }),
      addNamedExports(),
      isProd && terser(),
      copyTypes(),
    ].filter(Boolean),
  },

  // UMD (通用模块，可在浏览器中直接使用)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/100x-sdk.js',
      format: 'umd',
      name: 'Fun100xSDK',
      exports: 'named',
      sourcemap: !isProd,
      globals: {
        '@solana/web3.js': 'solanaWeb3',
        '@coral-xyz/anchor': 'anchor',
      },
    },
    external: ['@solana/web3.js', '@coral-xyz/anchor'],
    plugins: [
      json(),
      replace({
        'process.env.NODE_ENV': JSON.stringify(env),
        // 浏览器环境标识
        'typeof process !== \'undefined\' && process.versions && process.versions.node': 'false',
        // 修复 global 变量问题 - 更全面的替换
        'typeof global !== "undefined" ? global : typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : {}': 'globalThis',
        preventAssignment: true,
      }),
      nodePolyfills({
        include: ['buffer', 'process', 'util', 'path', 'fs'],
        globals: {
          global: false,
          __filename: false,
          __dirname: false,
        },
      }),
      nodeResolve({
        browser: true,
        preferBuiltins: false,
        exportConditions: ['browser'],
      }),
      commonjs({
        include: ['node_modules/**', 'src/**'],
        transformMixedEsModules: true,
      }),
      isProd && terser(),
      copyTypes(),
    ].filter(Boolean),
  },
];
