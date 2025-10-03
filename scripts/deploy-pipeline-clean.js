const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const Web3 = require('web3');
const fs = require('fs');
const { spawn } = require('child_process');
const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch'); // Add at the top if not already imported

// Environment variables
const GANACHE_PORT = process.env.GANACHE_PORT || '8545';
const GANACHE_HOST = process.env.GANACHE_HOST || '127.0.0.1';
const GANACHE_NETWORK_ID = process.env.GANACHE_NETWORK_ID || '5777';
const GANACHE_DB_PATH = process.env.GANACHE_DB_PATH || './ganache-db';
const GANACHE_BALANCE = process.env.GANACHE_BALANCE || '10000';
const GANACHE_ACCOUNTS = process.env.GANACHE_ACCOUNTS || '10';
const BLOCKCHAIN_SERVER_PORT = process.env.BLOCKCHAIN_SERVER_PORT || 3001;
const ENCRYPTION_KEY = Buffer.from(process.env.WALLET_ENC_KEY, 'hex');
console.log('Key length:', ENCRYPTION_KEY.length); // should print 32
const IV_LENGTH = 16; // AES block size
// Bonus funding tracking
const BONUS_FUNDING_FILE = path.join(__dirname, '../funded-wallets.json');
const WALLET_STORE_FILE = path.join(__dirname, '../wallet-store.json');


function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { iv: iv.toString('hex'), content: encrypted, tag: authTag };
}

function decrypt(encrypted) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    ENCRYPTION_KEY,
    Buffer.from(encrypted.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
  let decrypted = decipher.update(encrypted.content, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}


function startGanache() {
  return new Promise((resolve, reject) => {
    const dbPath = path.resolve(GANACHE_DB_PATH);
    const args = [
      'ganache',
      '--host', GANACHE_HOST,
      '--port', GANACHE_PORT,
      '--networkId', GANACHE_NETWORK_ID,
      '--db', dbPath,
      '--defaultBalanceEther', GANACHE_BALANCE,
      '--accounts', GANACHE_ACCOUNTS
    ];
    const ganacheProcess = spawn('npx', args, { shell: true, stdio: 'inherit' });

    // Kill ganache when main script exits
    const cleanup = () => {
      if (ganacheProcess && !ganacheProcess.killed) {
        console.log('Shutting down Ganache...');
        ganacheProcess.kill('SIGTERM');
      }
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', cleanup);

    ganacheProcess.on('error', (err) => reject(err));
    setTimeout(() => resolve(ganacheProcess), 7000);
  });
}

async function deployPaymentManager(web3, deployer) {
  const paymentManagerArtifactPath = path.join(__dirname, '../build/contracts/PaymentManager.json');
  if (!fs.existsSync(paymentManagerArtifactPath)) {
    throw new Error(`Artifact not found: ${paymentManagerArtifactPath}`);
  }
  const paymentManagerArtifact = JSON.parse(fs.readFileSync(paymentManagerArtifactPath, 'utf8'));
  const paymentManagerContract = new web3.eth.Contract(paymentManagerArtifact.abi);
  const deployTx = paymentManagerContract.deploy({ data: paymentManagerArtifact.bytecode });
  const gas = await deployTx.estimateGas({ from: deployer });
  const instance = await deployTx.send({ from: deployer, gas });
  console.log('PaymentManager deployed at:', instance.options.address);
  return { instance, abi: paymentManagerArtifact.abi };
}

// Bonus funding helper functions
function loadFundedWallets() {
  try {
    if (fs.existsSync(BONUS_FUNDING_FILE)) {
      const data = fs.readFileSync(BONUS_FUNDING_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('Error loading funded wallets:', err.message);
  }
  return {};
}

function saveFundedWallets(fundedWallets) {
  try {
    fs.writeFileSync(BONUS_FUNDING_FILE, JSON.stringify(fundedWallets, null, 2));
  } catch (err) {
    console.error('Error saving funded wallets:', err.message);
  }
}

function markWalletFunded(walletAddress) {
  const fundedWallets = loadFundedWallets();
  fundedWallets[walletAddress] = {
    funded: true,
    timestamp: Date.now()
  };
  saveFundedWallets(fundedWallets);
}

function isWalletEligibleForBonus(walletAddress) {
  const fundedWallets = loadFundedWallets();
  return !fundedWallets[walletAddress] || !fundedWallets[walletAddress].funded;
}

function loadWalletStore() {
  try {
    if (fs.existsSync(WALLET_STORE_FILE)) {
      const data = fs.readFileSync(WALLET_STORE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('Error loading wallet store:', err.message);
  }
  return {};
}

function saveWalletStore(store) {
  try {
    fs.writeFileSync(WALLET_STORE_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('Error saving wallet store:', err.message);
  }
}

async function main() {
  // Step 1: Start Ganache
  console.log('Starting Ganache...');
  await startGanache();

  // Step 2: Compile contracts
  try {
    console.log('Compiling contracts...');
    require('child_process').execSync('truffle compile', { stdio: 'inherit' });
  } catch (e) {
    console.error('Contract compilation failed:', e.message);
    process.exit(1);
  }

  // Step 3: Connect to Ganache
  const rpcUrl = `http://${GANACHE_HOST}:${GANACHE_PORT}`;
  const web3 = new Web3(rpcUrl);
  const accounts = await web3.eth.getAccounts();
  const deployer = accounts[0];
  let balance = await web3.eth.getBalance(deployer);

  // Wait until deployer is funded
  let retries = 0;
  while (web3.utils.toBN(balance).isZero() && retries < 10) {
    console.log('Waiting for Ganache to fund deployer account...');
    await new Promise(r => setTimeout(r, 1000));
    balance = await web3.eth.getBalance(deployer);
    retries++;
  }

  console.log('Deployer:', deployer);
  console.log('Balance:', web3.utils.fromWei(balance, 'ether'), 'ETH');

  if (web3.utils.toBN(balance).isZero()) {
    console.error('Deployer account still has 0 ETH. Ganache may not be running correctly.');
    process.exit(1);
  }

  // Step 4: Deploy PaymentManager
  const { instance: paymentManagerInstance, abi: paymentManagerAbi } = await deployPaymentManager(web3, deployer);

  // Step 5: Start Express server (middleware)
  const app = express();
  app.use(express.json());

  // Helper to get wallet address from PHP backend
  async function getWalletByEmail(email) {
    const baseUrl = 'https://ledgerly.hivizstudios.com/backend_example';
    const url = `${baseUrl}/email_payment.php?email=${encodeURIComponent(email)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.success && data.user && data.user.wallet_address) {
      return data.user.wallet_address;
    }
    throw new Error(`Wallet not found for email: ${email}`);
  }

  // Helper to update transaction status in PHP backend
  async function updateTransactionStatusPHP(txHash, status, extra = {}) {
    const baseUrl = 'https://ledgerly.hivizstudios.com/backend_example';
    const url = `${baseUrl}/transaction_api.php?action=update_status`;
    const body = {
      transaction_hash: txHash,
      status,
      ...extra
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return response.json();
  }

  // Helper: Map user to wallet in PHP backend
  async function mapUserToWallet(userId, walletAddress) {
    const url = 'https://ledgerly.hivizstudios.com/backend_example/wallet_api.php';
    const body = { user_id: userId, wallet_address: walletAddress };
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return response.json();
  }

  // Endpoint: Get wallet balance
  app.get('/wallet/balance/:walletAddress', async (req, res) => {
    try {
      const walletAddress = req.params.walletAddress;
      if (!web3.utils.isAddress(walletAddress)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }
      const balanceWei = await web3.eth.getBalance(walletAddress);
      const balanceEth = web3.utils.fromWei(balanceWei, 'ether');
      res.json({ success: true, balance: balanceEth });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Endpoint: Check bonus eligibility
  app.get('/wallet/bonus-eligible/:walletAddress', async (req, res) => {
    try {
      const walletAddress = req.params.walletAddress;
      if (!web3.utils.isAddress(walletAddress)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }
      const eligible = isWalletEligibleForBonus(walletAddress);
      res.json({ success: true, eligible });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Endpoint: Faucet funding
  app.post('/payment/faucet', async (req, res) => {
    try {
      const { toWallet, amountEth } = req.body;
      if (!web3.utils.isAddress(toWallet) || !amountEth) {
        return res.status(400).json({ error: 'toWallet and amountEth required' });
      }
      const amountWei = web3.utils.toWei(amountEth.toString(), 'ether');
      
      // Send ETH from deployer to user using PaymentManager contract
      const tx = await paymentManagerInstance.methods.sendPaymentToWallet(toWallet).send({
        from: deployer,
        value: amountWei,
        gas: 100000
      });
      
      markWalletFunded(toWallet);
      res.json({ success: true, txHash: tx.transactionHash });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Endpoint: Email-to-email payment
  app.post('/payment/email-to-email', async (req, res) => {
    try {
      const { fromEmail, toEmail, amountEth, memo } = req.body;
      if (!fromEmail || !toEmail || !amountEth) {
        return res.status(400).json({ error: 'fromEmail, toEmail, and amountEth required' });
      }

      // 1. Get wallet addresses from PHP backend
      const fromWallet = await getWalletByEmail(fromEmail);
      const toWallet = await getWalletByEmail(toEmail);

      // 2. Initiate payment
      const amountWei = web3.utils.toWei(amountEth.toString(), 'ether');
      const tx = await paymentManagerInstance.methods.sendPaymentFromWallet(toWallet).send({
        from: fromWallet,
        value: amountWei,
        gas: 100000
      });

      // 3. Update transaction status in PHP backend
      const receipt = await web3.eth.getTransactionReceipt(tx.transactionHash);
      const status = receipt && receipt.status ? 'completed' : 'failed';
      await updateTransactionStatusPHP(tx.transactionHash, status, {
        block_number: receipt ? receipt.blockNumber : null,
        block_hash: receipt ? receipt.blockHash : null,
        transaction_index: receipt ? receipt.transactionIndex : null,
        gas_used: receipt ? receipt.gasUsed : null,
        blockchain_timestamp: receipt ? (await web3.eth.getBlock(receipt.blockNumber)).timestamp : null,
        error_message: receipt && !receipt.status ? 'Transaction failed' : null
      });

      // 4. Return status to user
      res.json({
        success: true,
        txHash: tx.transactionHash,
        status
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
// Simple in-memory store for demo
let walletStore = loadWalletStore();

app.post('/wallet/create', async (req, res) => {
  try {
    const { userId } = req.body;
    console.log(`[CREATE WALLET] Received request for userId: ${userId}`);

    const privateKey = '0x' + crypto.randomBytes(32).toString('hex');
    console.log(`[CREATE WALLET] Generated private key: ${privateKey}`);

    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    console.log(`[CREATE WALLET] Created account with address: ${account.address}`);

    // Check funding eligibility
    const isFundingAvailable = isWalletEligibleForBonus(account.address);
    console.log(`[CREATE WALLET] Funding eligibility for ${account.address}: ${isFundingAvailable}`);

    // Encrypt private key before storing
    const encryptedKey = encrypt(privateKey);
    console.log(`[CREATE WALLET] Encrypted private key for storage.`);

    walletStore[userId] = {
      encryptedKey,
      address: account.address,
      createdAt: Date.now()
    };
    saveWalletStore(walletStore);
    console.log(`[CREATE WALLET] Saved wallet info to disk for userId: ${userId}`);

    // Map userId -> wallet in PHP backend
    let mappingResult = null;
    if (userId) {
      try {
        console.log(`[CREATE WALLET] Mapping userId ${userId} to wallet address ${account.address} in PHP backend...`);
        mappingResult = await mapUserToWallet(userId, account.address);
        console.log(`[CREATE WALLET] Mapping result: ${JSON.stringify(mappingResult)}`);
      } catch (err) {
        console.error(`[CREATE WALLET] Mapping failed: ${err.message}`);
        mappingResult = { success: false, error: err.message };
      }
    }

    res.json({
      success: true,
      address: account.address,
      isFundingAvailable, // <-- Add this line
      mapping: mappingResult
      // private key is **not** returned!
    });
    console.log(`[CREATE WALLET] Wallet creation completed for userId: ${userId}`);
  } catch (err) {
    console.error(`[CREATE WALLET] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

  // Start the server
  const server = app.listen(BLOCKCHAIN_SERVER_PORT, () => {
    console.log(`Blockchain middleware server running on port ${BLOCKCHAIN_SERVER_PORT}`);
  });

  console.log('Deployment and server setup complete!');

  return { ganacheProcess, server };
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection:', err);
  process.exit(1);
});

let ganacheProcess = null;
let expressServer = null;
let cleanupCalled = false;

function cleanup() {
  if (cleanupCalled) return;
  cleanupCalled = true;
  if (ganacheProcess && !ganacheProcess.killed) {
    console.log('Shutting down Ganache...');
    ganacheProcess.kill('SIGTERM');
  }
  if (expressServer) {
    console.log('Shutting down Express server...');
    expressServer.close(() => {
      console.log('Express server closed.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

// Start the application
main()
  .then(({ ganacheProcess: gProcess, server }) => {
    ganacheProcess = gProcess;
    expressServer = server;

    // Cleanup on exit
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', cleanup);
  })
  .catch(console.error);