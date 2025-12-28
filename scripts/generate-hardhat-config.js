const { Wallet, HDNodeWallet } = require("ethers");
const fs = require("fs");
const path = require("path");

// Ganache seed phrase
const MNEMONIC = "episode dwarf catalog pitch end cloth pluck ghost assist tip exchange curious";
const NUM_ACCOUNTS = 10;

// Mode: 'local' or 'kms'
const MODE = process.env.KEY_STORAGE_MODE || 'local';

async function generateConfig() {
  console.log("Deriving accounts from seed phrase...\n");

  const accounts = [];
  
  for (let i = 0; i < NUM_ACCOUNTS; i++) {
    const wallet = HDNodeWallet.fromPhrase(MNEMONIC, undefined, `m/44'/60'/0'/0/${i}`);
    accounts.push({
      address: wallet.address,
      privateKey: wallet.privateKey
    });
    console.log(`Account #${i}: ${wallet.address}`);
  }

  console.log("\nGenerating hardhat.config.cjs...");

  let configContent;

  if (MODE === 'kms') {
    configContent = generateKMSConfig(accounts);
  } else {
    configContent = generateLocalConfig(accounts);
  }

  const configPath = path.join(__dirname, "..", "hardhat.config.cjs");
  fs.writeFileSync(configPath, configContent, "utf8");

  console.log(`\n✅ hardhat.config.cjs created in ${MODE.toUpperCase()} mode!`);
  console.log(`📁 Location: ${configPath}`);
  
  console.log("\n📋 Account Summary:");
  console.log("━".repeat(80));
  accounts.forEach((acc, i) => {
    console.log(`Account #${i}: ${acc.address}`);
  });

  if (MODE === 'kms') {
    console.log("\n⚠️  Remember to:");
    console.log("1. Install AWS SDK: npm install @aws-sdk/client-kms");
    console.log("2. Upload private keys to KMS");
    console.log("3. Set AWS credentials and region");
    console.log("4. Update KMS key IDs in the config");
  }
}

function generateLocalConfig(accounts) {
  return `require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.28",
  networks: {
    ganache: {
      url: "http://127.0.0.1:8545",
      accounts: [
${accounts.map(acc => `        "${acc.privateKey}"`).join(',\n')}
      ],
      chainId: 1337
    }
  }
};
`;
}

function generateKMSConfig(accounts) {
  return `require("@nomicfoundation/hardhat-toolbox");
const { KMSClient, DecryptCommand } = require("@aws-sdk/client-kms");

// KMS configuration
const kmsClient = new KMSClient({
  region: process.env.AWS_REGION || "us-east-1"
});

// KMS Key IDs for each account (you'll need to populate these)
const KMS_KEY_IDS = [
${accounts.map((_, i) => `  process.env.KMS_KEY_ID_${i} || "your-kms-key-id-${i}"`).join(',\n')}
];

// Account addresses (public, safe to store)
const ADDRESSES = [
${accounts.map(acc => `  "${acc.address}"`).join(',\n')}
];

async function decryptPrivateKey(encryptedKey) {
  try {
    const command = new DecryptCommand({
      CiphertextBlob: Buffer.from(encryptedKey, 'base64')
    });
    const response = await kmsClient.send(command);
    return Buffer.from(response.Plaintext).toString('utf-8');
  } catch (error) {
    console.error("KMS decryption failed:", error);
    throw error;
  }
}

async function getAccounts() {
  const accounts = [];
  for (let i = 0; i < KMS_KEY_IDS.length; i++) {
    const keyId = KMS_KEY_IDS[i];
    if (keyId && !keyId.startsWith('your-kms-key-id')) {
      try {
        // In production, you'd fetch encrypted key from KMS/Secrets Manager
        // For now, this is a placeholder structure
        const privateKey = await decryptPrivateKey(process.env[\`ENCRYPTED_KEY_\${i}\`]);
        accounts.push(privateKey);
      } catch (error) {
        console.warn(\`Failed to load account #\${i} from KMS\`);
      }
    }
  }
  return accounts;
}

module.exports = {
  solidity: "0.8.28",
  networks: {
    ganache: {
      url: "http://127.0.0.1:8545",
      accounts: async () => {
        return await getAccounts();
      },
      chainId: 1337
    }
  }
};
`;
}

generateConfig().catch((error) => {
  console.error("Error generating config:", error);
  process.exit(1);
});
