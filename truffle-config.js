/**
 * Ledgerly Truffle Configuration
 * ==============================
 * 
 * This file configures your Truffle project for development and deployment.
 * For MetaMask integration, we recommend using one of these approaches:
 * 
 * Option 1: Direct MetaMask Integration (Recommended)
 * --------------------------------------------------
 * 1. Compile your contracts: truffle compile
 * 2. Run the script to extract artifacts: node extract-contract-data.js
 * 3. Use the in-app contract deployment page to deploy with MetaMask
 * 
 * Option 2: Truffle + Infura + MetaMask
 * ------------------------------------
 * 1. Install HDWalletProvider: npm install @truffle/hdwallet-provider
 * 2. Create a .env file with MNEMONIC and INFURA_API_KEY
 * 3. Configure the network settings below with Infura endpoint
 * 4. Run: truffle migrate --network sepolia
 * 
 * Option 3: Local Development with Ganache
 * --------------------------------------
 * 1. Install Ganache: https://trufflesuite.com/ganache/
 * 2. Run Ganache and create a new workspace
 * 3. Run: truffle migrate --network development
 * 
 * MetaMask Connection Instructions
 * -------------------------------
 * - Install MetaMask browser extension or mobile app
 * - Create or import a wallet
 * - Connect to desired network (Sepolia recommended for testing)
 * - Fund your account with testnet ETH (https://sepoliafaucet.com/)
 *
 * Deployment with Truffle Dashboard (Recommended for best security practice)
 * --------------------------------------------------------------------------
 *
 * Are you concerned about security and minimizing rekt status 🤔?
 * Use this method for best security:
 *
 * Truffle Dashboard lets you review transactions in detail, and leverages
 * MetaMask for signing, so there's no need to copy-paste your mnemonic.
 * More details can be found at 🔎:
 *
 * https://trufflesuite.com/docs/truffle/getting-started/using-the-truffle-dashboard/
 */

require('dotenv').config();
const { MNEMONIC, PROJECT_ID } = process.env;

const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {
  /**
   * Networks define how you connect to your ethereum client and let you set the
   * defaults web3 uses to send transactions. If you don't specify one truffle
   * will spin up a managed Ganache instance for you on port 9545 when you
   * run `develop` or `test`. You can ask a truffle command to use a specific
   * network from the command line, e.g
   *
   * $ truffle test --network <network-name>
   */

  networks: {
    // Useful for testing. The `development` name is special - truffle uses it by default
    // if it's defined here and no other network is specified at the command line.
    // You should run a client (like ganache, geth, or parity) in a separate terminal
    // tab if you use this network and you must also set the `host`, `port` and `network_id`
    // options below to some value.
    //
    development: {
      host: "127.0.0.1",     // Localhost
      port: 8545,            // Same port as Ganache (NOT 9545!)
      network_id: 5777,     // Same network ID as Ganache (as number)
      gas: 8000000,          // Increased gas limit for modular architecture
      gasPrice: 20000000000
    },
    
    sepolia: {
      provider: () => new HDWalletProvider(
        process.env.MNEMONIC,
        `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`
      ),
      network_id: 11155111,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true
    },
    
    mainnet: {
      provider: () => new HDWalletProvider(
        process.env.MNEMONIC,
        `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`
      ),
      network_id: 1,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true
    }
  },

  // Set default mocha options here, use special reporters, etc.
  mocha: {
    // timeout: 100000
  },

  // Configure your compilers
  compilers: {
    solc: {
      version: "0.8.19",
      settings: {
        optimizer: {
          enabled: false,
          runs: 200
        }
      }
    }
  },

  // Truffle DB is currently disabled by default; to enable it, change enabled:
  // false to enabled: true. The default storage location can also be
  // overridden by specifying the adapter settings, as shown in the commented code below.
  //
  // NOTE: It is not possible to migrate your contracts to truffle DB and you should
  // make a backup of your artifacts to a safe location before enabling this feature.
  //
  // After you backed up your artifacts you can utilize db by running migrate as follows:
  // $ truffle migrate --reset --compile-all
  //
  // db: {
  //   enabled: false,
  //   host: "127.0.0.1",
  //   adapter: {
  //     name: "indexeddb",
  //     settings: {
  //       directory: ".db"
  //     }
  //   }
  // }
};
