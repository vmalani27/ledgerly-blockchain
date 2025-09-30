# Guide: Deploying and Registering Smart Contracts with Node.js and PHP Backend

This guide explains how to deploy Ethereum smart contracts using Node.js, register their details with your PHP backend, and retrieve them in your Flutter app.

---

## 1. Deploying Contracts with Node.js

**Requirements:**
- Node.js
- `web3` or `ethers` library
- Contract ABI and bytecode (from Truffle/Hardhat build)
- Private key or mnemonic for deployment

**Example using `web3.js`:**

```js
const Web3 = require('web3');
const fs = require('fs');

// 1. Connect to blockchain (Ganache, Infura, etc.)
const web3 = new Web3('http://127.0.0.1:8545'); // or your RPC URL

// 2. Load contract ABI and bytecode
const abi = JSON.parse(fs.readFileSync('./build/YourContract.json')).abi;
const bytecode = JSON.parse(fs.readFileSync('./build/YourContract.json')).bytecode;

// 3. Set up deployer account
const account = web3.eth.accounts.privateKeyToAccount('0xYOUR_PRIVATE_KEY');
web3.eth.accounts.wallet.add(account);

// 4. Deploy contract
async function deploy() {
  const contract = new web3.eth.Contract(abi);
  const deployTx = contract.deploy({ data: bytecode });
  const gas = await deployTx.estimateGas();
  const deployed = await deployTx.send({
    from: account.address,
    gas,
  });
  console.log('Contract deployed at:', deployed.options.address);
  return { address: deployed.options.address, abi, tx: deployed.transactionHash };
}

deploy().then(console.log).catch(console.error);
```

---

## 2. Posting Contract Data to PHP Endpoint

After deployment, send a POST request to your PHP backend (`save_contract.php`) with the following JSON:

**Required parameters:**
- `contract_name` (string)
- `contract_address` (string)
- `chain_id` (int)
- `abi` (stringified JSON)

**Optional:**
- `deployment_tx` (string)
- `network_mode` (string, e.g., 'local', 'testnet', 'mainnet')
- `version` (string)
- `deployed_at` (datetime string)

**Example using `axios`:**

```js
const axios = require('axios');

async function postContractDetails(details) {
  const response = await axios.post('https://ledgerly.hivizstudios.com/backend_example/save_contract.php', {
    contract_name: 'EmailPaymentRegistry',
    contract_address: details.address,
    chain_id: 1337,
    abi: JSON.stringify(details.abi),
    deployment_tx: details.tx,
    network_mode: 'local',
    version: 'v1.0.0',
    deployed_at: new Date().toISOString()
  }, {
    headers: { 'Content-Type': 'application/json' }
  });
  console.log(response.data);
}
```

---

## 3. How Flutter Retrieves Contract Info

Flutter calls the PHP endpoint (GET request) to fetch the latest active contract for a given name and chain:

**Endpoint:**
```
GET https://ledgerly.hivizstudios.com/backend_example/save_contract.php?contract_name=EmailPaymentRegistry&chain_id=1337
```

**Response:**
```json
{
  "success": true,
  "contracts": [
    {
      "contract_name": "EmailPaymentRegistry",
      "contract_address": "0x...",
      "chain_id": 1337,
      "abi": "[{...}]", // JSON string
      "deployment_tx": "...",
      "network_mode": "local",
      "version": "v1.0.0",
      "deployed_at": "2025-09-28T12:34:56Z"
      // ...other fields
    }
  ],
  "count": 1
}
```

**Flutter Example (see `DynamicContractConfig`):**
```dart
final url = '${ApiConstants.saveContract}?contract_name=EmailPaymentRegistry&chain_id=1337';
final response = await http.get(Uri.parse(url));
final data = jsonDecode(response.body);
final contract = data['contracts'][0];
final abi = jsonDecode(contract['abi']); // Use with web3dart
final address = contract['contract_address'];
```

---

## Summary

1. **Node.js** deploys the contract and gets address, ABI, etc.
2. **Node.js** POSTs contract details to the PHP backend (`save_contract.php`).
3. **Flutter** fetches contract info via GET request to the same PHP endpoint, parses the ABI/address, and uses them for blockchain interactions.

---

**Need a ready-to-use Node.js script or Flutter code sample? Just ask!**
