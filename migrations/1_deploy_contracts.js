const Migrations = artifacts.require("Migrations");

module.exports = function (deployer, network, accounts) {
  console.log(`Deploying Migrations to network: ${network}`);
  console.log(`Using account: ${accounts[0]}`);
  
  deployer.deploy(Migrations, {
    from: accounts[0],
    gas: 500000,
    gasPrice: 20000000000
  }).then(() => {
    console.log(`Migrations deployed at: ${Migrations.address}`);
  });
};