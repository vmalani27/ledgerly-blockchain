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
