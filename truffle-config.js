// const path = require("path");
const HDWalletProvider = require("@truffle/hdwallet-provider")
const mnemonic = require("./secrets.json").mnemonic;
require("dotenv").config()

module.exports = {
	// See <http://truffleframework.com/docs/advanced/configuration> to customize your Truffle configuration!
	// contracts_build_directory: path.join(__dirname, "client/src/contracts"),
	networks: {
	  development: {
	    host: "127.0.0.1",
	    port: 7545,
	    // gas: 20000000,
	    network_id: 137,
	    skipDryRun: true
	  },
	  /*
	  Start Ganche Fork:
	  ganache-cli -f https://polygon-mainnet.infura.io/v3/d784ba1b7b8a4f13942f0a8aaf68596d --chainId 137 -u 0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE -u 0xF977814e90dA44bFA03b6295A0616a897441aceC -u 0x66c57bF505A85A74609D2C83E94Aabb26d691E1F -p 7545
	  */
	  ropsten: {
	    provider: () => new HDWalletProvider(mnemonic, `https://speedy-nodes-nyc.moralis.io/676a6c6eac64d9f866c4daca/eth/ropsten`),
	    network_id: 3,
	    gas: 5000000,
		gasPrice: 5000000000, // 5 Gwei
		skipDryRun: true
	  },
	  kovan: {
	    provider: () => new HDWalletProvider(mnemonic, `https://speedy-nodes-nyc.moralis.io/676a6c6eac64d9f866c4daca/eth/kovan`),
	    network_id: 42,
	    gas: 5000000,
		gasPrice: 5000000000, // 5 Gwei
		skipDryRun: true
	  },
	  mainnet: {
	    provider: () => new HDWalletProvider(mnemonic, process.env.RPC_URL),
	    network_id: 137,
	    gas: 5000000,
	    gasPrice: 550000000000 // 140 Gwei
	  }
	},
	compilers: {
		solc: {
			version: "^0.6.12",
		},
	},
}
