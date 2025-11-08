const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const Web3 = require('web3');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const HDKey = require('ethereumjs-wallet').hdkey;
const Wallet = require('ethereumjs-wallet').default || require('ethereumjs-wallet');
// Ganache default mnemonic
const GANACHE_MNEMONIC = process.env.GANACHE_MNEMONIC || 'myth like bonus scare over problem client lizard pioneer submit female collect';

function getDeployerPrivateKey() {
  // Derive the first account's private key from the mnemonic
  const hdwallet = HDKey.fromMasterSeed(require('bip39').mnemonicToSeedSync(GANACHE_MNEMONIC));
  const walletHdPath = "m/44'/60'/0'/0/0";
  const wallet = hdwallet.derivePath(walletHdPath).getWallet();
  return '0x' + wallet.getPrivateKey().toString('hex');
}

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


async function startGanache() {
  const dbPath = path.resolve(GANACHE_DB_PATH);

  // Ensure DB directory exists
  await fs.ensureDir(dbPath);

  // Check for leftover LOCK file (unclean shutdown)
  const lockFile = path.join(dbPath, 'LOCK');
  if (await fs.pathExists(lockFile)) {
    console.warn(`[GANACHE] Detected leftover LOCK file at ${lockFile}. Attempting cleanup...`);
    try {
      await fs.remove(lockFile);
      console.log(`[GANACHE] Removed stale LOCK file.`);
    } catch (err) {
      console.error(`[GANACHE] Could not remove LOCK file: ${err.message}`);
    }
  }

  const args = [
    'ganache',
    '--host', GANACHE_HOST,
    '--port', GANACHE_PORT,
    '--networkId', GANACHE_NETWORK_ID,
    '--db', dbPath,
    '--defaultBalanceEther', GANACHE_BALANCE,
    '--accounts', GANACHE_ACCOUNTS
  ];

  console.log(`[GANACHE] Launching Ganache with persistent DB: ${dbPath}`);
  const ganacheProcess = spawn('npx', args, { shell: true, stdio: 'inherit' });

  // Graceful cleanup
  const cleanup = async () => {
    if (ganacheProcess && !ganacheProcess.killed) {
      console.log('[GANACHE] Gracefully shutting down...');
      ganacheProcess.kill('SIGINT');
      // Give time to flush DB writes
      await new Promise(r => setTimeout(r, 2000));
      ganacheProcess.kill('SIGKILL');
    }
  };

  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('uncaughtException', async (err) => {
    console.error('[GANACHE] Uncaught exception:', err);
    await cleanup();
    process.exit(1);
  });

  return new Promise((resolve, reject) => {
    ganacheProcess.on('error', reject);
    setTimeout(() => {
      console.log('[GANACHE] Ready and running.');
      resolve(ganacheProcess);
    }, 7000); // allow startup
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

// Helper function to get private key for a wallet address
function getPrivateKeyByAddress(walletAddress) {
  const store = loadWalletStore();
  for (const userId in store) {
    if (store[userId].address.toLowerCase() === walletAddress.toLowerCase()) {
      return decrypt(store[userId].encryptedKey);
    }
  }
  throw new Error(`Private key not found for wallet address: ${walletAddress}`);
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
  console.log('Ganache accounts:');
  for (let i = 0; i < accounts.length; i++) {
    const accBalance = await web3.eth.getBalance(accounts[i]);
    console.log(`  [${i}] ${accounts[i]} - ${web3.utils.fromWei(accBalance, 'ether')} ETH`);
  }
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
      console.log(`[FAUCET] Received request: toWallet=${toWallet}, amountEth=${amountEth}`);
      if (!web3.utils.isAddress(toWallet) || !amountEth) {
        console.log(`[FAUCET] Invalid request params.`);
        return res.status(400).json({ error: 'toWallet and amountEth required' });
      }
      const amountWei = web3.utils.toWei(amountEth.toString(), 'ether');
      console.log(`[FAUCET] Sending transaction: from=${deployer}, to=${toWallet}, value=${amountWei}`);
      
      // Check deployer balance before sending
      const deployerBalance = await web3.eth.getBalance(deployer);
      const deployerBalanceEth = web3.utils.fromWei(deployerBalance, 'ether');
      console.log(`[FAUCET] Deployer balance: ${deployerBalanceEth} ETH`);
      
      try {
        // Use web3.eth.sendTransaction directly with the deployer account
        const txReceipt = await web3.eth.sendTransaction({
          from: deployer,
          to: toWallet,
          value: amountWei,
          gas: 100000
        });

        console.log(`[FAUCET] Transaction sent. Hash: ${txReceipt.transactionHash}`);
        markWalletFunded(toWallet);
        console.log(`[FAUCET] Marked wallet as funded: ${toWallet}`);
        res.json({ success: true, txHash: txReceipt.transactionHash });
      } catch (txErr) {
        console.error(`[FAUCET] Transaction error: ${txErr.message}`);
        res.status(500).json({ error: txErr.message });
      }
    } catch (err) {
      console.error(`[FAUCET] Error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Endpoint: Email-to-email payment
  app.post('/payment/email-to-email', async (req, res) => {
    try {
      const { fromEmail, toEmail, amountEth, memo } = req.body;
      console.log(`[EMAIL PAYMENT] Received request: fromEmail=${fromEmail}, toEmail=${toEmail}, amountEth=${amountEth}, memo=${memo}`);
      if (!fromEmail || !toEmail || !amountEth) {
        console.log(`[EMAIL PAYMENT] Invalid request params.`);
        return res.status(400).json({ error: 'fromEmail, toEmail, and amountEth required' });
      }

      // 1. Get wallet addresses from PHP backend
      console.log(`[EMAIL PAYMENT] Fetching wallet addresses for emails...`);
      const fromWallet = await getWalletByEmail(fromEmail);
      const toWallet = await getWalletByEmail(toEmail);
      console.log(`[EMAIL PAYMENT] fromWallet=${fromWallet}, toWallet=${toWallet}`);

      // 2. Get private key for sender wallet
      let senderPrivateKey;
      try {
        senderPrivateKey = getPrivateKeyByAddress(fromWallet);
        console.log(`[EMAIL PAYMENT] Found private key for sender wallet: ${fromWallet}`);
      } catch (err) {
        console.error(`[EMAIL PAYMENT] Private key not found: ${err.message}`);
        return res.status(400).json({ error: 'Sender wallet not found in local store' });
      }

      // 3. Initiate payment using signed transaction
      const amountWei = web3.utils.toWei(amountEth.toString(), 'ether');
      console.log(`[EMAIL PAYMENT] Sending transaction: from=${fromWallet}, to=${toWallet}, value=${amountWei}`);
      try {
        // Create and sign transaction manually
        const nonce = await web3.eth.getTransactionCount(fromWallet);
        const gasPrice = await web3.eth.getGasPrice();
        
        const signedTx = await web3.eth.accounts.signTransaction({
          nonce: nonce,
          to: toWallet,
          value: amountWei,
          gas: 100000,
          gasPrice: gasPrice
        }, senderPrivateKey);

        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        console.log(`[EMAIL PAYMENT] Transaction sent. Hash: ${receipt.transactionHash}`);

        // 4. Update transaction status in PHP backend
        const status = receipt && receipt.status ? 'completed' : 'failed';
        console.log(`[EMAIL PAYMENT] Transaction status: ${status}`);
        await updateTransactionStatusPHP(receipt.transactionHash, status, {
          block_number: receipt ? receipt.blockNumber : null,
          block_hash: receipt ? receipt.blockHash : null,
          transaction_index: receipt ? receipt.transactionIndex : null,
          gas_used: receipt ? receipt.gasUsed : null,
          blockchain_timestamp: receipt ? (await web3.eth.getBlock(receipt.blockNumber)).timestamp : null,
          error_message: receipt && !receipt.status ? 'Transaction failed' : null
        });
        console.log(`[EMAIL PAYMENT] Transaction status updated in PHP backend.`);

        // 5. Return status to user
        res.json({
          success: true,
          txHash: receipt.transactionHash,
          status
        });
      } catch (txErr) {
        console.error(`[EMAIL PAYMENT] Transaction error: ${txErr.message}`);
        res.status(500).json({ error: txErr.message });
      }
    } catch (err) {
      console.error(`[EMAIL PAYMENT] Error: ${err.message}`);
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

  // Wait briefly to allow Ganache to exit and flush DB
  setTimeout(() => {
    // Remove lock files if Ganache is not running
    const lockFiles = ['LOCK', 'CURRENT'];
    const dbPath = path.resolve(GANACHE_DB_PATH);
    lockFiles.forEach(file => {
      const filePath = path.join(dbPath, file);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`Removed Ganache DB lock file: ${filePath}`);
        } catch (err) {
          console.warn(`Failed to remove lock file ${filePath}: ${err.message}`);
        }
      }
    });

    if (expressServer) {
      console.log('Shutting down Express server...');
      expressServer.close(() => {
        console.log('Express server closed.');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }, 1000); // 1 second delay for safety
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