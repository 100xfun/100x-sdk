import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: [
      '@solana/web3.js',
      '@coral-xyz/anchor',
      '100x-sdk',
      'buffer',
      'decimal.js',
      'bs58',
      'axios'
    ],
    // Exclude problematic dependencies and let Vite handle them automatically
    exclude: ['@solana/codecs']
  },

  // Build configuration
  build: {
    // Increase the chunk size warning limit for large Solana dependencies
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Split chunks manually to avoid oversized chunks
        manualChunks: {
          'solana-web3': ['@solana/web3.js'],
          'anchor': ['@coral-xyz/anchor'],
          '100x-sdk': ['100x-sdk'],
          'utils': ['buffer', 'decimal.js', 'bs58']
        }
      }
    }
  },

  // Development server configuration
  server: {
    cors: true,
    // API proxy configuration
    proxy: {
      '/api/main': {
        target: 'https://api.100x.fun',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/main/, '')
      },
      '/api/devnet': {
        target: 'https://devtestapi.100x.fun',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/devnet/, '')
      }
    }
  },

  // Module resolution configuration
  resolve: {
    alias: {
      // Ensure polyfills resolve correctly
      buffer: 'buffer',
      process: 'process/browser',
      stream: 'stream-browserify',
      util: 'util',
      crypto: 'crypto-browserify'
    }
  },

  // Define global variables
  define: {
    global: 'globalThis',
    'process.env': process.env
  }
})
