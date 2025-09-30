// deploy-pipeline.js
// Production-ready contract deployment and registration pipeline
// Reads config from .env, deploys contracts, and registers them with PHP backend

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const Web3 = require('web3');
const fs = require('fs');
const axios = require('axios');


// We'll deploy EmailRegistry first, then use its address for PaymentManager

const { execSync } = require('child_process');

async function main() {
  // Step 0: Compile contracts
  try {
    console.log('Compiling contracts...');
    execSync('truffle compile', { stdio: 'inherit' });
  } catch (e) {
    console.error('Contract compilation failed:', e.message);
    process.exit(1);
  }
  const rpcUrl = process.env.GANACHE_RPC_URL || `http://${process.env.GANACHE_HOST || '127.0.0.1'}:${process.env.GANACHE_PORT || '8545'}`;
  const web3 = new Web3(rpcUrl);
  const accounts = await web3.eth.getAccounts();
  const deployer = accounts[0];
  const chainId = await web3.eth.getChainId();
  const phpBackend = process.env.PHP_BACKEND_URL;
  console.log("php backend url is ", phpBackend)

  // Deploy EmailRegistry first
  const emailRegistryArtifactPath = path.join(__dirname, '../build/contracts/EmailRegistry.json');
  if (!fs.existsSync(emailRegistryArtifactPath)) {
    console.error(`Artifact not found: ${emailRegistryArtifactPath}`);
    process.exit(1);
  }
  const emailRegistryArtifact = JSON.parse(fs.readFileSync(emailRegistryArtifactPath, 'utf8'));
  const emailRegistryContract = new web3.eth.Contract(emailRegistryArtifact.abi);
  const emailRegistryDeployTx = emailRegistryContract.deploy({ data: emailRegistryArtifact.bytecode });
  const emailRegistryGas = await emailRegistryDeployTx.estimateGas({ from: deployer });
  const emailRegistryInstance = await emailRegistryDeployTx.send({ from: deployer, gas: emailRegistryGas });
  console.log('EmailRegistry deployed at:', emailRegistryInstance.options.address);
  // Register EmailRegistry
  const emailRegistryPayload = {
    contract_name: 'EmailRegistry',
    contract_address: emailRegistryInstance.options.address,
    chain_id: chainId,
    abi: JSON.stringify(emailRegistryArtifact.abi),
    deployment_tx: emailRegistryInstance.transactionHash,
    network_mode: process.env.NETWORK_MODE || 'local',
    version: emailRegistryArtifact.contractVersion || 'v1.0.0',
    deployed_at: new Date().toISOString()
  };
  try {
    console.log('Registering EmailRegistry with backend. Request body:', emailRegistryPayload);
    const res = await axios.post(`${phpBackend}/save_contract.php`, emailRegistryPayload, { headers: { 'Content-Type': 'application/json' } });
    console.log('Registered EmailRegistry with backend:', res.data);
  } catch (e) {
    if (e.response) {
      console.error('Failed to register EmailRegistry:', e.response.data);
    } else {
      console.error('Failed to register EmailRegistry:', e.message);
    }
  }

  // Deploy PaymentManager with EmailRegistry address as constructor arg
  const paymentManagerArtifactPath = path.join(__dirname, '../build/contracts/PaymentManager.json');
  if (!fs.existsSync(paymentManagerArtifactPath)) {
    console.error(`Artifact not found: ${paymentManagerArtifactPath}`);
    process.exit(1);
  }
  const paymentManagerArtifact = JSON.parse(fs.readFileSync(paymentManagerArtifactPath, 'utf8'));
  const paymentManagerContract = new web3.eth.Contract(paymentManagerArtifact.abi);
  const paymentManagerDeployTx = paymentManagerContract.deploy({ data: paymentManagerArtifact.bytecode, arguments: [emailRegistryInstance.options.address] });
  const paymentManagerGas = await paymentManagerDeployTx.estimateGas({ from: deployer });
  const paymentManagerInstance = await paymentManagerDeployTx.send({ from: deployer, gas: paymentManagerGas });
  console.log('PaymentManager deployed at:', paymentManagerInstance.options.address);
  // Register PaymentManager
  const paymentManagerPayload = {
    contract_name: 'PaymentManager',
    contract_address: paymentManagerInstance.options.address,
    chain_id: chainId,
    abi: JSON.stringify(paymentManagerArtifact.abi),
    deployment_tx: paymentManagerInstance.transactionHash,
    network_mode: process.env.NETWORK_MODE || 'local',
    version: paymentManagerArtifact.contractVersion || 'v1.0.0',
    deployed_at: new Date().toISOString()
  };
  try {
    console.log('Registering PaymentManager with backend. Request body:', paymentManagerPayload);
    const res = await axios.post(`${phpBackend}/save_contract.php`, paymentManagerPayload, { headers: { 'Content-Type': 'application/json' } });
    console.log('Registered PaymentManager with backend:', res.data);
  } catch (e) {
    if (e.response) {
      console.error('Failed to register PaymentManager:', e.response.data);
    } else {
      console.error('Failed to register PaymentManager:', e.message);
    }
  }
}

main().catch(err => {
  console.error('Deployment pipeline failed:', err);
  process.exit(1);
});
