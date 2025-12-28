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
