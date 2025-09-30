const EmailRegistry = artifacts.require("EmailRegistry");
const PaymentManager = artifacts.require("PaymentManager");
const BasicFaucet = artifacts.require("BasicFaucet");

module.exports = function (deployer, network, accounts) {
  console.log(`Deploying Ledgerly core modules to network: ${network}`);
  console.log(`Using account: ${accounts[0]}`);
  
  // Deploy essential modules only
  deployer.deploy(EmailRegistry, {
    from: accounts[0],
    gas: 1500000,
    gasPrice: 20000000000
  }).then(() => {
    console.log(`EmailRegistry deployed at: ${EmailRegistry.address}`);
    return deployer.deploy(PaymentManager, EmailRegistry.address, {
      from: accounts[0],
      gas: 1500000,
      gasPrice: 20000000000
    });
  }).then(() => {
    console.log(`PaymentManager deployed at: ${PaymentManager.address}`);
    return deployer.deploy(BasicFaucet, {
      from: accounts[0],
      gas: 1000000,
      gasPrice: 20000000000,
      value: web3.utils.toWei('1', 'ether') // Fund with 1 ETH
    });
  }).then(() => {
    console.log(`BasicFaucet deployed at: ${BasicFaucet.address}`);
    console.log(`\n=== Core Deployment Complete ===`);
    console.log(`EmailRegistry: ${EmailRegistry.address}`);
    console.log(`PaymentManager: ${PaymentManager.address}`);
    console.log(`BasicFaucet: ${BasicFaucet.address}`);
  });
};