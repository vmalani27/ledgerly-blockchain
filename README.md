# Ledgerly Blockchain Middleware Pipeline Guide

This guide explains how the Ledgerly blockchain middleware works, how to set it up, and how to use its endpoints. It’s written for developers and testers who want to run the Node.js middleware, connect it to Ganache, and interact with the blockchain using REST APIs.

---

## 1. What is this pipeline?

- **Ledgerly Blockchain Middleware** is a Node.js server that connects to a local Ethereum blockchain (Ganache).
- It exposes REST endpoints for wallet creation, importing, balance checks, payments, faucet funding, and more.
- It securely stores wallet private keys (encrypted) and tracks bonus funding eligibility.
- It integrates with a PHP backend for user mapping and transaction logging.

---

## 2. How does it work?

- **Ganache** simulates an Ethereum blockchain locally.
- **Node.js Middleware**:
  - Starts Ganache and deploys smart contracts (like PaymentManager).
  - Provides endpoints for wallet management and payments.
  - Stores wallet info and funding status in encrypted JSON files.
  - Communicates with the PHP backend for user-wallet mapping and transaction history.
- **Flutter/Web/Other Clients** call these endpoints to interact with the blockchain.

---

## 3. How to set up

### A. Prerequisites

- Node.js (v18+ recommended)
- npm (comes with Node.js)
- Ganache (install via npm)
- Truffle (for contract compilation)
- PHP backend (for user mapping and transaction logging)

### B. Install dependencies

Open a terminal in your project folder and run:

```sh
npm install express web3 crypto node-fetch dotenv
npm install -g ganache
npm install -g truffle
```

### C. Prepare your `.env` file

Create a `.env` file in your project root (see your example):

```
GANACHE_PORT=8545
GANACHE_HOST=127.0.0.1
GANACHE_NETWORK_ID=5777
GANACHE_DB_PATH=./ganache-db
GANACHE_BALANCE=100000
GANACHE_ACCOUNTS=10
BLOCKCHAIN_SERVER_PORT=3001
WALLET_ENC_KEY=6f8e2b7c4d1a9e3f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8
```

**Note:**  
Generate a secure `WALLET_ENC_KEY` using:
```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### D. Compile contracts

```sh
truffle compile
```

### E. Start the middleware

```sh
node scripts/deploy-pipeline-clean.js
```

---

## 4. Endpoints Overview

### Wallet Endpoints

- **Create Wallet**
  - `POST /wallet/create`
  - Body: `{ "userId": 123 }`
  - Returns: wallet address, funding eligibility, mapping result

- **Import Wallet**
  - `POST /wallet/import`
  - Body: `{ "userId": 123, "privateKey": "0x..." }`
  - Returns: wallet address, funding eligibility, mapping result

- **Get Wallet Balance**
  - `GET /wallet/balance/:walletAddress`
  - Returns: ETH balance

- **Check Bonus Eligibility**
  - `GET /wallet/bonus-eligible/:walletAddress`
  - Returns: `{ eligible: true/false }`

- **Get Wallet Details (recommended for refresh)**
  - `GET /wallet/details/:walletAddress`
  - Returns: address, balance, funding eligibility

### Payment Endpoints

- **Faucet Funding**
  - `POST /payment/faucet`
  - Body: `{ "toWallet": "0x...", "amountEth": 1.0 }`
  - Returns: transaction hash

- **Email-to-Email Payment**
  - `POST /payment/email-to-email`
  - Body: `{ "fromEmail": "...", "toEmail": "...", "amountEth": 0.5, "memo": "..." }`
  - Returns: transaction hash, status

---

## 5. How the pipeline flows

1. **Start Ganache**: Local blockchain is started and contracts are deployed.
2. **Create/Import Wallet**: User requests a wallet; private key is generated/imported, encrypted, and stored. User-wallet mapping is sent to PHP backend.
3. **Check Balance/Eligibility**: User can check wallet balance and bonus funding eligibility.
4. **Faucet Funding**: If eligible, user can request test ETH from the faucet.
5. **Payments**: Users can send payments (ETH) to other wallets or via email.
6. **Transaction Logging**: All payments are logged to the PHP backend for history and analytics.
7. **Shutdown**: Ctrl+C or server exit triggers cleanup, shutting down Ganache and Express gracefully.

---

## 6. Debugging & Logs

- All major actions print debug statements to the console (wallet creation, funding, payments, errors).
- If Ganache DB is corrupted or missing, the middleware will warn and exit.
- Funding eligibility and wallet info are tracked in JSON files (`funded-wallets.json`, `wallet-store.json`).

---

## 7. Security Notes

- Private keys are encrypted using AES-256-GCM with your `WALLET_ENC_KEY`.
- Never share your `.env` file or wallet-store.json publicly.
- Always use a secure, randomly generated encryption key.

---

## 8. Testing Endpoints

- Use Postman or cURL to test endpoints.
- Example Postman collection is provided (see previous answers).

---

## 9. Troubleshooting

- If you see "Waiting for Ganache to fund deployer account...", check your Ganache DB and restart Ganache.
- If you get "Invalid key length", check your `.env` key and ensure it's 64 hex characters.
- For PHP backend errors, check your PHP logs and database connection.

---

## 10. Summary

Ledgerly’s pipeline lets you:
- Run a local blockchain for development and testing.
- Manage wallets and payments securely.
- Integrate with backend systems for user mapping and transaction history.
- Easily extend with new endpoints and features.

---

**Ready to get started?**  
Just follow the setup steps, run the middleware, and start calling the endpoints!  
Let me know if you need more details or help with integration.
