const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const Web3 = require('web3');
const fs = require('fs');
const { spawn } = require('child_process');
const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch'); // Add at the top if not already imported
// (MySQL integration removed: this file only uses the PHP backend for off-chain records)

// Backend configuration
const PHP_BACKEND_BASE_URL = process.env.PHP_BACKEND_URL || 'http://localhost/backend_example';

// Environment variables
const GANACHE_PORT = process.env.GANACHE_PORT || '8545';
const GANACHE_HOST = process.env.GANACHE_HOST || '127.0.0.1';
const GANACHE_NETWORK_ID = process.env.GANACHE_NETWORK_ID || '5777';
const GANACHE_DB_PATH = process.env.GANACHE_DB_PATH || './ganache-db';
const GANACHE_BALANCE = process.env.GANACHE_BALANCE || '10000';
const GANACHE_ACCOUNTS = process.env.GANACHE_ACCOUNTS || '10';
const BLOCKCHAIN_SERVER_PORT = process.env.BLOCKCHAIN_SERVER_PORT || 3001;
const WALLET_ENC_KEY = process.env.WALLET_ENC_KEY;
if (!WALLET_ENC_KEY) {
  console.error('Environment variable WALLET_ENC_KEY is not set. Please add a 64-character hex key to your .env (example: WALLET_ENC_KEY=0123...abcd)');
  process.exit(1);
}
if (typeof WALLET_ENC_KEY !== 'string' || WALLET_ENC_KEY.length !== 64 || !/^[0-9a-fA-F]+$/.test(WALLET_ENC_KEY)) {
  console.error('WALLET_ENC_KEY must be a 64-character hex string (32 bytes). Current value is invalid.');
  process.exit(1);
}
const ENCRYPTION_KEY = Buffer.from(WALLET_ENC_KEY, 'hex');
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
      '--db', `"${dbPath}"`,  // Quote the path to handle spaces
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
    require('child_process').execSync('truffle compile', { 
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')  // Ensure truffle runs from project root
    });
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
    const url = `${PHP_BACKEND_BASE_URL}/email_payment.php?email=${encodeURIComponent(email)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.success && data.user && data.user.wallet_address) {
      return data.user.wallet_address;
    }
    throw new Error(`Wallet not found for email: ${email}`);
  }

  // Helper to update transaction status in PHP backend
  async function updateTransactionStatusPHP(txHash, status, extra = {}) {
    try {
      const body = {
        txHash: txHash,
        tx_hash: txHash, // Support both formats
        status,
        ...extra
      };
      
      console.log(`[UPDATE STATUS] Updating transaction ${txHash} to status: ${status}`);
      console.log(`[UPDATE STATUS] Request body:`, JSON.stringify(body, null, 2));
      
      // FIXED: Add ?action=webhook_update back to URL
      const response = await fetch(`${PHP_BACKEND_BASE_URL}/transaction_api.php?action=webhook_update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const responseText = await response.text();
      console.log(`[UPDATE STATUS] Raw response (${response.status}): ${responseText.substring(0, 500)}...`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${responseText}`);
      }
      
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error(`[UPDATE STATUS] Failed to parse response as JSON: ${parseError.message}`);
        return { 
          success: false, 
          error: `Invalid JSON response: ${responseText.substring(0, 200)}...`,
          http_status: response.status
        };
      }
      
      console.log(`[UPDATE STATUS] Update result:`, JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      console.error(`[UPDATE STATUS] Failed to update transaction ${txHash}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Helper to create a transaction record in PHP backend (off-chain record for UI)
  async function createTransactionPHP(payload) {
    try {
      console.log(`[CREATE TX] Creating transaction record in PHP backend...`);
      console.log(`[CREATE TX] Payload:`, JSON.stringify(payload, null, 2));
      
      const url = `${PHP_BACKEND_BASE_URL}/transaction_api.php?action=webhook_update`;
      const body = {
        action: 'create_full',
        ...payload
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log(`[CREATE TX] Transaction record created:`, JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      console.error(`[CREATE TX] Failed to create transaction record:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Helper: Map user to wallet in PHP backend
  async function mapUserToWallet(userId, walletAddress) {
    const url = `${PHP_BACKEND_BASE_URL}/wallet_api.php`;
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

  // Helper to create dual transaction records (sender + receiver perspectives)
  async function createDualTransactionRecords(senderWallet, receiverWallet, amount, paymentType, memo, transactionId) {
    const records = [];
    
    // Create sender's record (outbound)
    const senderPayload = {
        transaction_id: `${transactionId}_sender`,
        wallet_address: senderWallet,
        from_address: senderWallet,
        to_address: receiverWallet,
        amount: amount,
        currency_symbol: 'ETH',
        transaction_type: 'send', // ← Fixed: Use valid enum value
        direction: 'outbound',
        status: 'pending',
        memo: memo,
        network_mode: process.env.NETWORK_MODE || 'local'
    };
    
    // Create receiver's record (inbound)
    const receiverPayload = {
        transaction_id: `${transactionId}_receiver`,
        wallet_address: receiverWallet,
        from_address: senderWallet,
        to_address: receiverWallet,
        amount: amount,
        currency_symbol: 'ETH',
        transaction_type: 'receive', // ← Fixed: Use valid enum value
        direction: 'inbound',
        status: 'pending',
        memo: memo,
        network_mode: process.env.NETWORK_MODE || 'local'
    };
    
    try {
        console.log(`[DUAL RECORDS] Creating sender record for ${senderWallet}`);
        const senderResult = await createTransactionPHP(senderPayload);
        if (senderResult.success) {
            records.push({ type: 'sender', result: senderResult, payload: senderPayload });
        }
        
        console.log(`[DUAL RECORDS] Creating receiver record for ${receiverWallet}`);
        const receiverResult = await createTransactionPHP(receiverPayload);
        if (receiverResult.success) {
            records.push({ type: 'receiver', result: receiverResult, payload: receiverPayload });
        }
        
        return records;
    } catch (error) {
        console.error(`[DUAL RECORDS] Error creating dual records:`, error.message);
        return records; // Return whatever we managed to create
    }
  }

  // Helper to update multiple transaction records with same txHash
  async function updateDualTransactionStatus(records, txHash, status, extra = {}) {
    const updates = [];
    
    for (const record of records) {
      try {
        const updateResult = await updateTransactionStatusPHP(txHash, status, {
          transaction_id: record.payload.transaction_id,
          transaction_db_id: record.result.transaction_db_id,
          ...extra
        });
        updates.push({ type: record.type, success: updateResult.success });
      } catch (error) {
        console.error(`[DUAL UPDATE] Failed to update ${record.type} record:`, error.message);
        updates.push({ type: record.type, success: false, error: error.message });
      }
    }
    
    return updates;
  }

  // Updated Faucet endpoint (faucet = system sends to user, so only inbound record needed)
  app.post('/payment/faucet', async (req, res) => {
    try {
      const { toWallet, amountEth } = req.body;
      console.log(`[FAUCET] Request for ${amountEth} ETH to ${toWallet}`);
      
      // Input validation
      if (!toWallet || !amountEth) {
        return res.status(400).json({ error: 'toWallet and amountEth are required' });
      }
      
      if (!web3.utils.isAddress(toWallet)) {
        return res.status(400).json({ error: 'Invalid wallet address format' });
      }
      
      if (parseFloat(amountEth) <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
      }
      
      if (parseFloat(amountEth) > 100) { // Prevent abuse
        return res.status(400).json({ error: 'Faucet amount cannot exceed 100 ETH' });
      }
      
      // Check if wallet is eligible for bonus funding
      if (!isWalletEligibleForBonus(toWallet)) {
        return res.status(429).json({ 
          error: 'Wallet has already received faucet funding',
          eligible: false 
        });
      }
      
      // Generate transaction ID
      const transactionId = `faucet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log(`[FAUCET] Generated transaction ID: ${transactionId}`);
      
      // Create single transaction record (inbound to recipient)
      const createPayload = {
        transaction_id: transactionId,
        wallet_address: toWallet,
        from_address: deployer, // System/faucet address
        to_address: toWallet,
        amount: amountEth,
        currency_symbol: 'ETH',
        transaction_type: 'faucet',
        direction: 'inbound', // User receiving funds
        status: 'pending',
        memo: 'Faucet funding',
        network_mode: process.env.NETWORK_MODE || 'local'
      };
      
      const createResult = await createTransactionPHP(createPayload);
      if (!createResult.success) {
        throw new Error(`Failed to create transaction record: ${createResult.error}`);
      }
      console.log(`[FAUCET] Created transaction record: ${createResult.transaction_db_id}`);

      // Execute blockchain transaction
      const amountWei = web3.utils.toWei(amountEth.toString(), 'ether');
      console.log(`[FAUCET] Executing blockchain transaction...`);
      
      const tx = await paymentManagerInstance.methods.sendPaymentToWallet(toWallet).send({
        from: deployer,
        value: amountWei,
        gas: 200000
      });

      console.log(`[FAUCET] Blockchain transaction sent: ${tx.transactionHash}`);

      // Mark wallet as funded for bonus tracking
      markWalletFunded(toWallet);

      // Update transaction with blockchain hash
      await updateTransactionStatusPHP(tx.transactionHash, 'submitted', {
        transaction_id: transactionId,
        transaction_db_id: createResult.transaction_db_id
      });

      // Monitor transaction status asynchronously
      (async () => {
        try {
          console.log(`[FAUCET] Waiting for confirmation: ${tx.transactionHash}`);
          const receipt = await waitForReceipt(tx.transactionHash);
          const status = receipt && receipt.status ? 'completed' : 'failed';
          const block = receipt ? await web3.eth.getBlock(receipt.blockNumber) : null;

          console.log(`[FAUCET] Transaction ${status}: ${tx.transactionHash}`);

          // Final status update
          const updateResult = await updateTransactionStatusPHP(tx.transactionHash, status, {
            transaction_id: transactionId,
            transaction_db_id: createResult.transaction_db_id,
            block_number: receipt ? receipt.blockNumber : null,
            block_hash: receipt ? receipt.blockHash : null,
            transaction_index: receipt ? receipt.transactionIndex : null,
            gas_used: receipt ? receipt.gasUsed : null,
            blockchain_timestamp: block ? block.timestamp : null,
            error_message: receipt && !receipt.status ? 'Transaction failed on blockchain' : null
          });

          console.log(`[FAUCET] Final status update result:`, JSON.stringify(updateResult, null, 2));

        } catch (err) {
          console.error(`[FAUCET] Confirmation error for ${tx.transactionHash}:`, err.message);
          
          await updateTransactionStatusPHP(tx.transactionHash, 'failed', {
            transaction_id: transactionId,
            transaction_db_id: createResult.transaction_db_id,
            error_message: err.message
          });
        }
      })();

      // Return immediate response
      res.json({ 
        success: true, 
        transaction_id: transactionId,
        txHash: tx.transactionHash,
        status: 'submitted',
        message: 'Faucet funding submitted successfully',
        amount: amountEth
      });

    } catch (err) {
      console.error(`[FAUCET] Error:`, err.message);
      res.status(500).json({ 
        success: false, 
        error: err.message 
      });
    }
  });

  // Add this endpoint to deploy-pipeline-clean.js
app.post('/wallet/create', async (req, res) => {
  try {
    const { userId, userName } = req.body;
    console.log(`[CREATE WALLET] Received request for userId: ${userId}, userName: ${userName}`);

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'User ID is required' 
      });
    }

    // Generate new wallet
    const privateKey = '0x' + crypto.randomBytes(32).toString('hex');
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    console.log(`[CREATE WALLET] Created account with address: ${account.address}`);

    // Check funding eligibility
    const isFundingAvailable = isWalletEligibleForBonus(account.address);
    console.log(`[CREATE WALLET] Funding available for ${account.address}: ${isFundingAvailable}`);

    // Load existing wallet store
    let walletStore = loadWalletStore();

    // Encrypt and store private key in Node.js wallet store
    const encryptedKey = encrypt(privateKey);
    walletStore[userId] = {
      encryptedKey,
      address: account.address,
      createdAt: Date.now(),
      userName: userName || `User ${userId}`
    };
    
    // Save wallet store to file
    saveWalletStore(walletStore);
    console.log(`[CREATE WALLET] Saved wallet info to Node.js store for userId: ${userId}`);
    console.log(`[CREATE WALLET] Wallet store now has ${Object.keys(walletStore).length} wallets`);

    // Map userId → wallet in PHP backend
    let mappingResult = { success: false };
    try {
      console.log(`[CREATE WALLET] Mapping userId ${userId} to wallet ${account.address} in PHP backend...`);
      mappingResult = await mapUserToWallet(userId, account.address);
      console.log(`[CREATE WALLET] Mapping result:`, JSON.stringify(mappingResult));
      
      if (!mappingResult.success) {
        console.warn(`[CREATE WALLET] Mapping failed but continuing: ${mappingResult.message}`);
        // Don't fail the whole operation - PHP will handle this as fallback
      }
    } catch (err) {
      console.error(`[CREATE WALLET] Mapping error: ${err.message}`);
      mappingResult = { success: false, error: err.message };
    }

    // Return success response
    const response = {
      success: true,
      address: account.address,
      isFundingAvailable,
      mapping: mappingResult,
      message: 'Wallet created successfully',
      stored_in_nodejs: true
    };

    console.log(`[CREATE WALLET] Wallet creation completed for userId: ${userId}`);
    console.log(`[CREATE WALLET] Response:`, JSON.stringify(response, null, 2));
    
    res.json(response);
    
  } catch (err) {
    console.error(`[CREATE WALLET] Error: ${err.message}`);
    console.error(`[CREATE WALLET] Stack trace: ${err.stack}`);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      stored_in_nodejs: false
    });
  }
});



  // Updated Email-to-email payment (creates dual records)
  app.post('/payment/email-to-email', async (req, res) => {
    try {
      const { fromEmail, toEmail, amountEth, memo } = req.body;
      console.log(`[EMAIL PAYMENT] Processing payment: ${fromEmail} → ${toEmail}, Amount: ${amountEth} ETH`);
      
      // Input validation
      if (!fromEmail || !toEmail || !amountEth) {
        return res.status(400).json({ error: 'fromEmail, toEmail, and amountEth are required' });
      }
      
      if (fromEmail === toEmail) {
        return res.status(400).json({ error: 'Cannot send payment to yourself' });
      }
      
      if (parseFloat(amountEth) <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
      }
      
      if (parseFloat(amountEth) > 1000) { // Prevent abuse
        return res.status(400).json({ error: 'Payment amount cannot exceed 1000 ETH' });
      }

      // Get wallet addresses from PHP backend
      let fromWallet, toWallet;
      try {
        fromWallet = await getWalletByEmail(fromEmail);
        toWallet = await getWalletByEmail(toEmail);
      } catch (error) {
        return res.status(404).json({ error: error.message });
      }
      
      console.log(`[EMAIL PAYMENT] Wallets: ${fromWallet} → ${toWallet}`);
      
      // Validate wallet addresses
      if (!web3.utils.isAddress(fromWallet) || !web3.utils.isAddress(toWallet)) {
        return res.status(400).json({ error: 'Invalid wallet address(es) found' });
      }
      
      if (fromWallet.toLowerCase() === toWallet.toLowerCase()) {
        return res.status(400).json({ error: 'Source and destination wallets are the same' });
      }

      // Check sender balance
      const senderBalance = await web3.eth.getBalance(fromWallet);
      const senderBalanceEth = parseFloat(web3.utils.fromWei(senderBalance, 'ether'));
      const amountFloat = parseFloat(amountEth);
      
      if (senderBalanceEth < amountFloat) {
        return res.status(400).json({ 
          error: 'Insufficient balance',
          available: senderBalanceEth.toString(),
          required: amountFloat.toString()
        });
      }

      // Generate transaction ID
      const transactionId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log(`[EMAIL PAYMENT] Generated transaction ID: ${transactionId}`);

      // Create dual transaction records with correct payment type
      const dualRecords = await createDualTransactionRecords(
        fromWallet,
        toWallet,
        amountEth,
        'email', // ← This parameter is now ignored, we use 'send'/'receive' internally
        memo || `Payment from ${fromEmail} to ${toEmail}`,
        transactionId
      );
      
      if (dualRecords.length === 0) {
        throw new Error('Failed to create transaction records');
      }
      
      console.log(`[EMAIL PAYMENT] Created ${dualRecords.length} transaction records`);

      // Execute blockchain transaction
      const amountWei = web3.utils.toWei(amountEth.toString(), 'ether');
      console.log(`[EMAIL PAYMENT] Executing blockchain transaction...`);
      
      // Use manual transaction instead of contract call
      const tx = await sendTransactionWithPrivateKey(fromWallet, toWallet, amountWei);
      
      console.log(`[EMAIL PAYMENT] Blockchain transaction sent: ${tx.transactionHash}`);

      // Update all records with blockchain hash immediately
      await updateDualTransactionStatus(dualRecords, tx.transactionHash, 'submitted');

      // Monitor transaction status asynchronously
      (async () => {
        try {
          console.log(`[EMAIL PAYMENT] Waiting for confirmation: ${tx.transactionHash}`);
          const receipt = await waitForReceipt(tx.transactionHash);
          const status = receipt && receipt.status ? 'completed' : 'failed';
          const block = receipt ? await web3.eth.getBlock(receipt.blockNumber) : null;

          console.log(`[EMAIL PAYMENT] Transaction ${status}: ${tx.transactionHash}`);
          console.log(`[EMAIL PAYMENT] Block: ${receipt ? receipt.blockNumber : 'N/A'}, Gas used: ${receipt ? receipt.gasUsed : 'N/A'}`);

          // Final status update for both records
          const finalUpdates = await updateDualTransactionStatus(dualRecords, tx.transactionHash, status, {
            block_number: receipt ? receipt.blockNumber : null,
            block_hash: receipt ? receipt.blockHash : null,
            transaction_index: receipt ? receipt.transactionIndex : null,
            gas_used: receipt ? receipt.gasUsed : null,
            blockchain_timestamp: block ? block.timestamp : null,
            error_message: receipt && !receipt.status ? 'Transaction failed on blockchain' : null
          });

          console.log(`[EMAIL PAYMENT] Final status updates:`, JSON.stringify(finalUpdates, null, 2));

        } catch (err) {
          console.error(`[EMAIL PAYMENT] Confirmation error for ${tx.transactionHash}:`, err.message);
          
          // Update both records to failed
          await updateDualTransactionStatus(dualRecords, tx.transactionHash, 'failed', {
            error_message: err.message
          });
        }
      })();

      // 7. Return immediate response
      res.json({
        success: true,
        transaction_id: transactionId,
        txHash: tx.transactionHash,
        status: 'submitted',
        message: 'Payment submitted successfully',
        from_email: fromEmail,
        to_email: toEmail,
        amount: amountEth,
        records_created: dualRecords.length
      });

    } catch (err) {
      console.error(`[EMAIL PAYMENT] Error:`, err.message);
      res.status(500).json({ 
        success: false, 
        error: err.message 
      });
    }
  });

  // Add a new endpoint for wallet-to-wallet transfers (direct addresses)
  app.post('/payment/wallet-to-wallet', async (req, res) => {
    try {
      const { fromWallet, toWallet, amountEth, memo } = req.body;
      console.log(`[WALLET PAYMENT] Processing payment: ${fromWallet} → ${toWallet}, Amount: ${amountEth} ETH`);
      
      // Input validation
      if (!fromWallet || !toWallet || !amountEth) {
        return res.status(400).json({ error: 'fromWallet, toWallet, and amountEth are required' });
      }
      
      if (!web3.utils.isAddress(fromWallet) || !web3.utils.isAddress(toWallet)) {
        return res.status(400).json({ error: 'Invalid wallet address format' });
      }
      
      if (fromWallet.toLowerCase() === toWallet.toLowerCase()) {
        return res.status(400).json({ error: 'Cannot send payment to same wallet' });
      }
      
      if (parseFloat(amountEth) <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
      }
      
      if (parseFloat(amountEth) > 1000) { // Prevent abuse
        return res.status(400).json({ error: 'Payment amount cannot exceed 1000 ETH' });
      }

      // Check sender balance
      const senderBalance = await web3.eth.getBalance(fromWallet);
      const senderBalanceEth = parseFloat(web3.utils.fromWei(senderBalance, 'ether'));
      const amountFloat = parseFloat(amountEth);
      
      if (senderBalanceEth < amountFloat) {
        return res.status(400).json({ 
          error: 'Insufficient balance',
          available: senderBalanceEth.toString(),
          required: amountFloat.toString()
        });
      }

      // Generate transaction ID
      const transactionId = `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log(`[WALLET PAYMENT] Generated transaction ID: ${transactionId}`);

      // Create dual transaction records
      const dualRecords = await createDualTransactionRecords(
        fromWallet,
        toWallet,
        amountEth,
        'wallet_transfer',
        memo || `Direct wallet transfer`,
        transactionId
      );
      
      if (dualRecords.length === 0) {
        throw new Error('Failed to create transaction records');
      }
      
      console.log(`[WALLET PAYMENT] Created ${dualRecords.length} transaction records`);

      // Execute blockchain transaction
      const amountWei = web3.utils.toWei(amountEth.toString(), 'ether');
      console.log(`[WALLET PAYMENT] Executing blockchain transaction...`);
      
      const tx = await sendTransactionWithPrivateKey(fromWallet, toWallet, amountWei);
      
      console.log(`[WALLET PAYMENT] Blockchain transaction sent: ${tx.transactionHash}`);

      // Update all records with blockchain hash immediately
      await updateDualTransactionStatus(dualRecords, tx.transactionHash, 'submitted');

      // Monitor transaction status asynchronously
      (async () => {
        try {
          console.log(`[WALLET PAYMENT] Waiting for confirmation: ${tx.transactionHash}`);
          const receipt = await waitForReceipt(tx.transactionHash);
          const status = receipt && receipt.status ? 'completed' : 'failed';
          const block = receipt ? await web3.eth.getBlock(receipt.blockNumber) : null;

          console.log(`[WALLET PAYMENT] Transaction ${status}: ${tx.transactionHash}`);

          // Final status update for both records
          await updateDualTransactionStatus(dualRecords, tx.transactionHash, status, {
            block_number: receipt ? receipt.blockNumber : null,
            block_hash: receipt ? receipt.blockHash : null,
            transaction_index: receipt ? receipt.transactionIndex : null,
            gas_used: receipt ? receipt.gasUsed : null,
            blockchain_timestamp: block ? block.timestamp : null,
            error_message: receipt && !receipt.status ? 'Transaction failed on blockchain' : null
          });

        } catch (err) {
          console.error(`[WALLET PAYMENT] Confirmation error for ${tx.transactionHash}:`, err.message);
          
          await updateDualTransactionStatus(dualRecords, tx.transactionHash, 'failed', {
            error_message: err.message
          });
        }
      })();

      // Return immediate response
      res.json({
        success: true,
        transaction_id: transactionId,
        txHash: tx.transactionHash,
        status: 'submitted',
        message: 'Wallet transfer submitted successfully',
        from_wallet: fromWallet,
        to_wallet: toWallet,
        amount: amountEth,
        records_created: dualRecords.length
      });

    } catch (err) {
      console.error(`[WALLET PAYMENT] Error:`, err.message);
      res.status(500).json({ 
        success: false, 
        error: err.message 
      });
    }
  });
  
  // Add this helper function near the top with other helpers
  async function waitForReceipt(txHash, timeoutMs = 120000, pollInterval = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const receipt = await web3.eth.getTransactionReceipt(txHash);
      if (receipt) return receipt;
      await new Promise(r => setTimeout(r, pollInterval));
    }
    throw new Error('Timeout waiting for transaction receipt');
  }

  // Add helper to get decrypted private key
  function getPrivateKeyForWallet(walletAddress) {
    const walletStore = loadWalletStore();
    
    // Find wallet by address
    for (const [userId, walletData] of Object.entries(walletStore)) {
      if (walletData.address.toLowerCase() === walletAddress.toLowerCase()) {
        return decrypt(walletData.encryptedKey);
      }
    }
    
    throw new Error(`Private key not found for wallet: ${walletAddress}`);
  }

  // Add helper to send transaction with private key
  async function sendTransactionWithPrivateKey(fromWallet, toWallet, amountWei, gasLimit = 200000) {
    try {
      // Get private key for sender wallet
      const privateKey = getPrivateKeyForWallet(fromWallet);
      
      // Get transaction count (nonce)
      const nonce = await web3.eth.getTransactionCount(fromWallet);
      
      // Get current gas price
      const gasPrice = await web3.eth.getGasPrice();
      
      // Create transaction object
      const txObject = {
        nonce: web3.utils.toHex(nonce),
        to: toWallet,
        value: web3.utils.toHex(amountWei),
        gasLimit: web3.utils.toHex(gasLimit),
        gasPrice: web3.utils.toHex(gasPrice)
      };
      
      // Sign transaction
      const signedTx = await web3.eth.accounts.signTransaction(txObject, privateKey);
      
      // Send signed transaction
      const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      
      return receipt;
      
    } catch (error) {
      console.error(`[SEND TX] Error sending transaction: ${error.message}`);
      throw error;
    }
  }

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