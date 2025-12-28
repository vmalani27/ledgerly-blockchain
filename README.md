# Ledgerly Blockchain Middleware

This repository contains the Ledgerly Node.js middleware that manages a local development blockchain (Ganache), deploys contracts, and exposes REST endpoints for your frontend (Flutter/Web) to interact with.  
The middleware also integrates with a PHP backend for user-wallet mapping and maintaining off-chain transaction records.

---
ganache \ --wallet.seed "test test test test test test test test test test test junk" \ --miner.blockTime 0 \ --database.dbPath ./chainData \ --chain.networkId 1337 \ --server.port 8545

## Quick Start

1. **Create a `.env` file in the project root** (example values):

    ```
    GANACHE_PORT=8545
    GANACHE_HOST=127.0.0.1
    GANACHE_NETWORK_ID=5777
    GANACHE_DB_PATH=./ganache-db
    GANACHE_BALANCE=100000
    GANACHE_ACCOUNTS=10
    BLOCKCHAIN_SERVER_PORT=3001
    WALLET_ENC_KEY=<64-hex-chars>
    NETWORK_MODE=local
    PHP_BACKEND_URL=https://ledgerly.hivizstudios.com/backend_example
    ```

    Generate a secure WALLET_ENC_KEY:

    ```sh
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    ```

2. **Compile contracts:**

    ```sh
    truffle compile
    ```

3. **Start the middleware (starts Ganache, compiles, deploys, runs Express):**

    ```sh
    npm run dev
    # or
    nodemon scripts/app.js
    # or
    node scripts/app.js
    ```

    The server listens on `BLOCKCHAIN_SERVER_PORT` (default 3001).

---

## REST API — Endpoints

All endpoints are JSON-based. The middleware uses a PHP backend for persistent user-wallet mapping and off-chain transaction records.  
The PHP base URL is configured via `PHP_BACKEND_URL` in `.env`.

Base URL (example): `http://127.0.0.1:3001`

### 1) Create Wallet

- **POST** `/wallet/create`
- **Body:** `{ "userId": 123, "userName": "Alice" }`
- **Description:** Generates a new Ethereum account (private key encrypted and stored locally) and maps the wallet to the provided userId via the PHP backend. Returns the new address and mapping result.
- **Example:**
    ```sh
    curl -X POST http://127.0.0.1:3001/wallet/create \
      -H 'Content-Type: application/json' \
      -d '{"userId":123,"userName":"Alice"}'
    ```
- **Response:**
    ```json
    {
      "success": true,
      "address": "0x...",
      "isFundingAvailable": true,
      "mapping": { /* PHP response */ },
      "message": "Wallet created successfully",
      "stored_in_nodejs": true
    }
    ```
- **Notes:**  
  - The private key is **not returned**. It is encrypted with AES-256-GCM using `WALLET_ENC_KEY` and stored in `wallet-store.json`.

### 2) Import Wallet

- **POST** `/wallet/import`
- **Body:** `{ "userId": 123, "privateKey": "0x..." }`
- **Description:** Imports an existing wallet (e.g., Ganache account) into the encrypted wallet store and maps it to the userId via the PHP backend.
- **Response:**
    ```json
    {
      "success": true,
      "wallet_address": "0x...",
      "user_id": 123,
      "message": "Wallet imported successfully"
    }
    ```

### 3) Get Wallet Balance

- **GET** `/wallet/balance/:walletAddress`
- **Description:** Returns ETH balance for the given address (from Ganache).
- **Example:**
    ```sh
    curl http://127.0.0.1:3001/wallet/balance/0xABC...
    ```
- **Response:**
    ```json
    { "success": true, "balance": "10000" }
    ```

### 4) Check Bonus Eligibility

- **GET** `/wallet/bonus-eligible/:walletAddress`
- **Description:** Returns whether the wallet is eligible for a one-time faucet/top-up (tracked in `funded-wallets.json`).
- **Example:**
    ```sh
    curl http://127.0.0.1:3001/wallet/bonus-eligible/0xABC...
    ```
- **Response:**
    ```json
    { "success": true, "eligible": true }
    ```

### 5) Faucet Funding

- **POST** `/payment/faucet`
- **Body:** `{ "toWallet": "0x...", "amountEth": 1.0 }`
- **Description:** Sends ETH from the deployer account to `toWallet`.  
  - Creates an off-chain transaction record in PHP.
  - Sends the on-chain transaction using the deployed PaymentManager contract.
  - Updates the PHP backend with the txHash and status.
  - Polls for the receipt and updates final status.
- **Example:**
    ```sh
    curl -X POST http://127.0.0.1:3001/payment/faucet \
      -H 'Content-Type: application/json' \
      -d '{"toWallet":"0x...","amountEth":1.0}'
    ```
- **Response:**
    ```json
    { "success": true, "txHash": "0x...", ... }
    ```

### 6) Email-to-Email Payment

- **POST** `/payment/email-to-email`
- **Body:** `{ "fromEmail": "alice@example.com", "toEmail": "bob@example.com", "amountEth": 0.5, "memo": "Payment" }`
- **Description:** Sends ETH from the wallet mapped to `fromEmail` to the wallet mapped to `toEmail`.
  - Resolves both emails to wallet addresses via the PHP backend.
  - Creates off-chain transaction records for sender and receiver.
  - Signs and sends the on-chain transaction using the sender's private key.
  - Updates PHP backend with txHash and status.
- **Example:**
    ```sh
    curl -X POST http://127.0.0.1:3001/payment/email-to-email \
      -H 'Content-Type: application/json' \
      -d '{"fromEmail":"alice@example.com","toEmail":"bob@example.com","amountEth":0.5,"memo":"Thanks"}'
    ```
- **Response:**
    ```json
    { "success": true, "txHash": "0x...", "status": "submitted", ... }
    ```

### 7) Wallet-to-Wallet Payment

- **POST** `/payment/wallet-to-wallet`
- **Body:** `{ "fromWallet": "0x...", "toWallet": "0x...", "amountEth": 0.5, "memo": "Transfer" }`
- **Description:** Sends ETH from one wallet to another using the sender's private key stored in the encrypted wallet store.
  - Creates off-chain transaction records for sender and receiver.
  - Signs and sends the on-chain transaction.
  - Updates PHP backend with txHash and status.
- **Example:**
    ```sh
    curl -X POST http://127.0.0.1:3001/payment/wallet-to-wallet \
      -H 'Content-Type: application/json' \
      -d '{"fromWallet":"0x...","toWallet":"0x...","amountEth":0.5,"memo":"Transfer"}'
    ```
- **Response:**
    ```json
    { "success": true, "txHash": "0x...", "status": "submitted", ... }
    ```

---

## PHP Backend Expectations

The Node middleware communicates with a PHP backend for:
- User <-> wallet mapping (`wallet_api.php` with PUT)
- Creating and updating off-chain transaction records (`transaction_api.php?action=webhook_update`)
- Resolving an email to a wallet (`email_payment.php?email=...`)

The middleware logs full PHP responses for debugging.  
Ensure the PHP endpoints return consistent fields (`transaction_id`, `transaction_db_id`, etc.).

---

## Files Used by the Middleware

- `wallet-store.json` — encrypted private keys and wallet addresses.
- `funded-wallets.json` — one-time faucet tracking.

---

## Debugging Tips

- If an endpoint fails, check console logs for PHP response bodies and error messages.
- Ensure `PHP_BACKEND_URL` is reachable from the machine running Node.
- Ganache is started automatically by the middleware.
- Use the `/wallet/import` endpoint to add Ganache accounts to your wallet store if needed.

---

## Development

- Use `nodemon` for auto-reloading during development:
    ```sh
    npm install --save-dev nodemon
    npm run dev
    ```
    Or run directly:
    ```sh
    nodemon scripts/app.js
    ```

---

If you want, I can also:
- Add an endpoint to proxy and return a user's transactions by querying the PHP backend.
- Add a Postman collection or examples directory with ready-to-run cURL requests.

Let me know if you want any of those!
