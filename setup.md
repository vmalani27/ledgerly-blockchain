Great — now that Hardhat ↔ Ganache persistent connection is confirmed and working correctly, here is the **clean, step-by-step guide for persistent smart contract development** (Phase-1 completion).

This guide is structured to ensure you understand exactly *what to do and why*, without breaking persistence again.

---

# ✅ **PHASE 1 — LOCAL BLOCKCHAIN PERSISTENCE**

### **Goal**

Keep blockchain state alive across restarts and reuse the same contract instead of redeploying.

### **Steps**

---

## **Step 1 — Start Ganache manually (persistent)**

```bash
ganache --wallet.seed "episode dwarf catalog pitch end cloth pluck ghost assist tip exchange curious" --database.dbPath "./chainData" --chain.networkId 1337 --server.port 8545
```

### Expected:

* First account 1000 ETH
* RPC listening on `127.0.0.1:8545`
* Folder `chainData/` created

Keep this terminal running.

---

## **Step 2 — Hardhat config pointed to Ganache**

`hardhat.config.cjs`

```js
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.28",
  networks: {
    ganache: {
      url: "http://127.0.0.1:8545",
      accounts: [
        "0x5fae1835225f1ea99cd38ecf5f2a1f47f843ffa6cb421447ef7d6761027b6bfe"
      ],
      chainId: 1337
    }
  }
};
```

---

## **Step 3 — Test connection**

```bash
npx hardhat console --network ganache
```

Inside console:

```js
(await ethers.getSigners())[0].address
(await ethers.provider.getBalance((await ethers.getSigners())[0].address)).toString()
```

Expected:

* Address matches Ganache account #0
* Balance 1000 ETH in wei

### ✔ Connection confirmed

---

## **Step 4 — Create single deploy script**

`scripts/deploy.js`

```js
const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const PM = await hre.ethers.deployContract("PaymentManager");
  await PM.waitForDeployment();
  const address = await PM.getAddress();
  console.log("Deployed at:", address);
  fs.writeFileSync("payment-manager.address", address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

---

## **Step 5 — Deploy ONCE (important)**

```bash
npx hardhat run scripts/deploy.js --network ganache
```

Result:

```
Deployed at: 0xABC123...
```

A file `payment-manager.address` appears and stores the address.

---

## **Step 6 — Use contract instead of redeploying**

When using your Node app or scripts:

```js
const abi = JSON.parse(fs.readFileSync("./artifacts/contracts/PaymentManager.sol/PaymentManager.json")).abi;
const address = fs.readFileSync("./payment-manager.address").toString().trim();
const contract = new web3.eth.Contract(abi, address);
```

---

## **Step 7 — Restart test**

### Stop Ganache:

`CTRL + C`

### Start again:

```bash
ganache --wallet.seed "episode dwarf catalog pitch end cloth pluck ghost assist tip exchange curious" --database.dbPath "./chainData" --chain.networkId 1337 --server.port 8545
```

### Run console:

```bash
npx hardhat console --network ganache
```

Inside:

```js
(await ethers.getSigners())[0].address
(await ethers.provider.getBalance("0xABC123...")).toString()
```

✔ Contract still exists
✔ Balance still same
✔ State persisted successfully

---

# 🎉 **Persistence is now working**

No more redeploying, no more balance loss, no more “insufficient funds”, no more resetting the chain accidentally.

---

# 🚀 **NEXT PHASE OPTIONS (tell me what you want next)**

### **Phase 2 — Node middleware for calling contract**

* API server interacting with persistent contract
* /sendPayment endpoint
* Logging + error handling

### **Phase 3 — Frontend integration**

* Flutter / React connection using ABI + saved address

### **Phase 4 — Snapshot / restore system**

* Save chain snapshot automatically
* Script restore to previous version

### **Phase 5 — Docker automation**

* Hardhat + persistence volume
* Deployment separation & health monitoring

---

# 👉 Choose next step

Reply with **A / B / C / D** depending on what you want to work on теперь:

| Option | What you’ll learn next                                     |
| ------ | ---------------------------------------------------------- |
| **A**  | Build persistent Node backend that interacts with contract |
| **B**  | Flutter / React UI integration                             |
| **C**  | State snapshot / restore automation                        |
| **D**  | Docker persistent blockchain environment                   |

Just reply: **A / B / C / D**
(no extra text).
