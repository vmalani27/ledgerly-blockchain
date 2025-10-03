/**
 * API Documentation: Flutter/Web3Dart Integration
 * ==============================================
 *
 * 1. Get Ganache Network Info
 *    - Endpoint: GET /ganache-info
 *    - Response: { networkId, host, port, started }
 *    - Usage: Use this to configure your Web3Dart client for the correct network.
 *
 * 2. Fund User Wallet
 *    - Endpoint: POST /fund-user
 *    - Body (JSON):
 *        {
 *          "recipientAddress": "0x...", // User's wallet address
 *          "amountEth": 1,              // Amount in ETH (default: 1)
 *          "custodianAddress": "0x..." // Custodian wallet address (must be registered on backend)
 *        }
 *    - Response:
 *        {
 *          "success": true,
 *          "transactionHash": "0x...",
 *          "from": "0x...",
 *          "to": "0x...",
 *          "amountEth": 1,
 *          "blockNumber": 123
 *        }
 *    - Usage: Call this endpoint from Flutter to request testnet ETH for a user wallet.
 *
 * 3. KMS Encryption/Decryption (for admin/dev only)
 *    - POST /kms/encrypt { privateKey }
 *    - POST /kms/decrypt { encryptedKey }
 *    - Not needed for normal app users.
 *
 * 4. Start/Stop Ganache (for admin/dev only)
 *    - POST /start-ganache
 *    - POST /stop-ganache
 *
 * Notes:
 * - The backend never exposes custodian private keys. All signing is done server-side.
 * - User wallets (Flutter/Web3Dart) are managed client-side; backend only funds them.
 * - For production, use HTTPS and proper authentication for sensitive endpoints.
 */



// Load environment variables from .env
require('dotenv').config();

// blockchain-server.js
// Main entry point for managing Ganache and blockchain-related APIs

const express = require('express');
const app = express();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
const fetch = require('node-fetch');

const GANACHE_PORT = process.env.GANACHE_PORT || 8545;
const GANACHE_HOST = process.env.GANACHE_HOST || '127.0.0.1';
const GANACHE_NETWORK_ID = process.env.GANACHE_NETWORK_ID || '5777';
const GANACHE_DB_PATH = process.env.GANACHE_DB_PATH || './ganache-db';
const GANACHE_BALANCE = process.env.GANACHE_BALANCE || '10000';
const GANACHE_ACCOUNTS = process.env.GANACHE_ACCOUNTS || '1';

let ganacheProcess = null;
let ganacheInfo = {
  networkId: null,
  host: GANACHE_HOST,
  port: GANACHE_PORT,
  started: false
};

let ganacheOutput = '';

// Move startGanache and its dependencies above app.listen
// startGanache function and Ganache process management
function startGanache() {
  return new Promise((resolve, reject) => {
    if (ganacheProcess) {
      return resolve({ status: 'already running' });
    }
    const dbPath = path.resolve(GANACHE_DB_PATH, `ganache-db-${Date.now()}.json`);
    const args = [
      '--host', GANACHE_HOST,
      '--port', GANACHE_PORT,
      '--networkId', GANACHE_NETWORK_ID,
      '--db', dbPath,
      '--defaultBalanceEther', GANACHE_BALANCE,
      '--accounts', GANACHE_ACCOUNTS
    ];
    // Use shell: true for cross-platform npx resolution
    const npxCmd = 'npx';
    ganacheProcess = spawn(npxCmd, [
      'ganache-cli',
      '--port', GANACHE_PORT,
      '--deterministic',
      '--accounts', GANACHE_ACCOUNTS,
      '--defaultBalanceEther', GANACHE_BALANCE,
      '--gasLimit', '8000000',
      '--gasPrice', '20000000000',
      '--db', GANACHE_DB_PATH,
      '--networkId', GANACHE_NETWORK_ID,
      '--host', GANACHE_HOST
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true // <--- this is the key for npx on Windows
    });
    ganacheProcess.stdout.on('data', async (data) => {
      const output = data.toString();
      // Only print Ganache output that does NOT contain private keys or account info
      // Remove 'Available Accounts' and 'Private Keys' sections from output
      let filtered = output.replace(/Available Accounts[\s\S]*?\n\n/, '')
                          .replace(/Private Keys[\s\S]*?\n\n/, '');
      process.stdout.write(filtered);
      ganacheOutput += output;
      if (output.includes('Listening on')) {
        ganacheInfo.started = true;
        // Parse and secure wallets
        await parseGanacheAccountsAndKeys(ganacheOutput);
        await updateCustodianBalances();
      }
      const netIdMatch = output.match(/Network Id:\s*(\d+)/);
      if (netIdMatch) {
        ganacheInfo.networkId = netIdMatch[1];
      }
    });
    ganacheProcess.stderr.on('data', (data) => {
      console.error(`Ganache Error: ${data}`);
    });
    ganacheProcess.on('close', (code) => {
      console.log(`Ganache process exited with code ${code}`);
      ganacheProcess = null;
      ganacheInfo.started = false;
    });
  });
}

function stopGanache() {
  return new Promise((resolve) => {
    if (!ganacheProcess) {
      return resolve({ status: 'not running' });
    }
    process.kill(-ganacheProcess.pid);
    ganacheProcess = null;
    ganacheInfo.started = false;
    resolve({ status: 'stopped' });
  });
}

// Securely parse Ganache output and populate custodianWallets
async function parseGanacheAccountsAndKeys(output) {
  const accounts = [];
  const keys = [];
  let inAccounts = false, inKeys = false;
  for (const line of output.split('\n')) {
    if (line.includes('Available Accounts')) { inAccounts = true; inKeys = false; continue; }
    if (line.includes('Private Keys')) { inAccounts = false; inKeys = true; continue; }
    if (inAccounts && line.match(/^\s*\(\d+\)\s+0x[a-fA-F0-9]{40}/)) {
      const addr = line.match(/0x[a-fA-F0-9]{40}/)[0];
      accounts.push(addr);
    }
    if (inKeys && line.match(/^\s*\(\d+\)\s+0x[a-fA-F0-9]{64}/)) {
      const key = line.match(/0x[a-fA-F0-9]{64}/)[0];
      keys.push(key);
    }
    if (line.trim() === '') { inAccounts = false; inKeys = false; }
  }
  // Encrypt and store
  custodianWallets = [];
  for (let i = 0; i < accounts.length && i < keys.length; i++) {
    try {
  // Encrypt private key with KMS
  const encryptedKey = await encryptPrivateKey(keys[i]);
  custodianWallets.push({ address: accounts[i], encryptedKey, balance: 0 });
    } catch (e) {
      // Optionally log or handle encryption errors here in production
    }
  }
}

// Helper to update balances for all custodian wallets
async function updateCustodianBalances() {
  const rpcUrl = `http://${GANACHE_HOST}:${GANACHE_PORT}`;
  const web3 = new Web3(rpcUrl);
  for (let wallet of custodianWallets) {
    try {
      const bal = await web3.eth.getBalance(wallet.address);
      wallet.balance = parseFloat(web3.utils.fromWei(bal, 'ether'));
    } catch (e) {
      wallet.balance = 0;
    }
  }
}

// Helper to get a custodian wallet with nonzero balance
function getAvailableCustodianWallet() {
  return custodianWallets.find(w => w.balance > 0);
}

// /fund-user endpoint: POST { recipientAddress, amountEth }
app.post('/fund-user', express.json(), async (req, res) => {
  try {
    const { recipientAddress, amountEth = 1, custodianAddress } = req.body;
    if (!recipientAddress) {
      return res.status(400).json({ error: 'recipientAddress required' });
    }
    await updateCustodianBalances();
    // Find custodian wallet
    let wallet;
    if (custodianAddress) {
      wallet = custodianWallets.find(w => w.address.toLowerCase() === custodianAddress.toLowerCase() && w.balance > 0);
      if (!wallet) {
        return res.status(404).json({ error: 'Custodian wallet not found or has zero balance' });
      }
    } else {
      wallet = getAvailableCustodianWallet();
      if (!wallet) {
        return res.status(400).json({ error: 'No custodian wallet with nonzero balance available' });
      }
    }
  // KMS decryption in use
    // Decrypt private key
    const privateKey = await decryptPrivateKey(wallet.encryptedKey);
    // Connect to Ganache
    const rpcUrl = `http://${GANACHE_HOST}:${GANACHE_PORT}`;
    const web3 = new Web3(rpcUrl);
    // Validate recipient
    if (!web3.utils.isAddress(recipientAddress)) {
      return res.status(400).json({ error: 'Invalid recipient address' });
    }
    // Check funder balance (redundant, but safe)
    if (wallet.balance < amountEth) {
      return res.status(400).json({ error: `Insufficient funds. Funder has ${wallet.balance} ETH, need ${amountEth} ETH` });
    }
    // Prepare transaction
    const amountWei = web3.utils.toWei(amountEth.toString(), 'ether');
    const gasPrice = await web3.eth.getGasPrice();
    const nonce = await web3.eth.getTransactionCount(wallet.address);
    const tx = {
      from: wallet.address,
      to: recipientAddress,
      value: amountWei,
      gas: 21000,
      gasPrice,
      nonce
    };
    // Sign and send
    const signed = await web3.eth.accounts.signTransaction(tx, privateKey);
    const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);
    // Update balances after transaction
    await updateCustodianBalances();
    // Return result
    res.json({
      success: true,
      transactionHash: receipt.transactionHash,
      from: wallet.address,
      to: recipientAddress,
      amountEth,
      blockNumber: receipt.blockNumber
    });
  } catch (err) {
    console.error('Fund user error:', err);
    res.status(500).json({ error: err.message });
  }
});
const { KMSClient, EncryptCommand, DecryptCommand } = require('@aws-sdk/client-kms');
const kmsRegion = process.env.AWS_REGION || 'eu-north-1';
const kmsKeyId = process.env.KMS_KEY_ID;
const kmsClient = new KMSClient({ region: kmsRegion });

// Custodian wallet management (encrypted with KMS)
// (see declaration above for custodianWallets)

// Encrypt a private key with KMS
async function encryptPrivateKey(plainKey) {
  const command = new EncryptCommand({
    KeyId: kmsKeyId,
    Plaintext: Buffer.from(plainKey)
  });
  const response = await kmsClient.send(command);
  return Buffer.from(response.CiphertextBlob).toString('base64');
}

// Decrypt a private key with KMS
async function decryptPrivateKey(encryptedKeyBase64) {
  const command = new DecryptCommand({
    CiphertextBlob: Buffer.from(encryptedKeyBase64, 'base64')
  });
  const response = await kmsClient.send(command);
  return Buffer.from(response.Plaintext).toString('utf8');
}

// API endpoint to encrypt a private key (for testing/demo)


app.get('/ganache-info', (req, res) => {
  res.json({
    networkId: ganacheInfo.networkId || GANACHE_NETWORK_ID,
    host: ganacheInfo.host,
    port: ganacheInfo.port,
    started: ganacheInfo.started
  });
});

app.post('/start-ganache', (req, res) => {
  startGanache();
  res.json({ status: 'starting' });
});

app.post('/stop-ganache', (req, res) => {
  stopGanache();
  res.json({ status: 'stopping' });
});

// Admin endpoint: Get all custodian wallets and their balances
app.get('/admin/custodian-wallets', (req, res) => {
  // In production, add authentication/authorization here!
  res.json({ wallets: custodianWallets });
});

// Catch-all for wrong HTTP methods on all endpoints
app.use((req, res, next) => {
  if (!res.headersSent) {
    res.status(405).json({ error: 'Wrong HTTP method. Please check the API documentation for allowed methods.' });
  } else {
    next();
  }
});

console.log('Process PATH:', process.env.PATH);

const PORT = process.env.BLOCKCHAIN_SERVER_PORT || 3001;
app.listen(PORT, async () => {
  console.log(`Blockchain server running on http://localhost:${PORT}`);
  await startGanache();
  await deployAndRegisterContracts();
});

// Helper to deploy a contract
async function deployContract(web3, abi, bytecode, args = [], from) {
  const contract = new web3.eth.Contract(abi);
  const deployTx = contract.deploy({ data: bytecode, arguments: args });
  const gas = await deployTx.estimateGas({ from });
  const instance = await deployTx.send({ from, gas });
  return instance;
}

// Deploy contracts after Ganache is ready
async function deployAndRegisterContracts() {
  const rpcUrl = `http://${GANACHE_HOST}:${GANACHE_PORT}`;
  const web3 = new Web3(rpcUrl);
  const accounts = await web3.eth.getAccounts();
  const deployer = accounts[0];

  // Load compiled PaymentManager artifact
  const paymentManagerArtifact = require('../contracts/PaymentManager.json');

  // Deploy PaymentManager (no constructor args)
  const paymentManager = await deployContract(
    web3,
    paymentManagerArtifact.abi,
    paymentManagerArtifact.bytecode,
    [],
    deployer
  );
  console.log('Deployed PaymentManager at', paymentManager.options.address);

  // Store for later use
  global.paymentManager = paymentManager;
// PaymentManager RESTful endpoints
app.post('/payment/send', express.json(), async (req, res) => {
  try {
    const { toWallet, amountEth } = req.body;
    if (!toWallet || !amountEth) {
      return res.status(400).json({ error: 'toWallet and amountEth required' });
    }
    const rpcUrl = `http://${GANACHE_HOST}:${GANACHE_PORT}`;
    const web3 = new Web3(rpcUrl);
    const accounts = await web3.eth.getAccounts();
    const sender = accounts[0]; // For demo, use first account as sender
    const amountWei = web3.utils.toWei(amountEth.toString(), 'ether');
    const tx = await global.paymentManager.methods.sendPaymentToWallet(toWallet).send({ from: sender, value: amountWei });
    res.json({ success: true, txHash: tx.transactionHash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/payment/batch', express.json(), async (req, res) => {
  try {
    const { toWallets, amounts } = req.body;
    if (!Array.isArray(toWallets) || !Array.isArray(amounts) || toWallets.length !== amounts.length) {
      return res.status(400).json({ error: 'toWallets and amounts arrays required and must match in length' });
    }
    const rpcUrl = `http://${GANACHE_HOST}:${GANACHE_PORT}`;
    const web3 = new Web3(rpcUrl);
    const accounts = await web3.eth.getAccounts();
    const sender = accounts[0];
    const amountsWei = amounts.map(a => web3.utils.toWei(a.toString(), 'ether'));
    const totalWei = amountsWei.reduce((acc, val) => acc + BigInt(val), BigInt(0));
    const tx = await global.paymentManager.methods.batchPaymentToWallets(toWallets, amountsWei).send({ from: sender, value: totalWei.toString() });
    res.json({ success: true, txHash: tx.transactionHash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/payment/withdraw', express.json(), async (req, res) => {
  try {
    const rpcUrl = `http://${GANACHE_HOST}:${GANACHE_PORT}`;
    const web3 = new Web3(rpcUrl);
    const accounts = await web3.eth.getAccounts();
    const owner = accounts[0];
    const tx = await global.paymentManager.methods.withdraw().send({ from: owner });
    res.json({ success: true, txHash: tx.transactionHash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
}

// Graceful shutdown
process.on('SIGINT', () => {
  stopGanache();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopGanache();
  process.exit(0);
});
