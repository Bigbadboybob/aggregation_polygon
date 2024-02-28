"use strict"
require('dotenv').config()
const axios = require("axios");
const crypto = require("crypto");
const Web3 = require('web3')
const HDWalletProvider = require("@truffle/hdwallet-provider")
const mnemonic = require("../secrets.json").mnemonic;
const privateKey = require("../secrets.json").privateKey;
const provider = new HDWalletProvider(mnemonic, process.env.SPARE_URL2)
const web3 = new Web3(provider)

var transactionCount

async function test() {
    await web3.eth.getTransactionCount(process.env.ADDRESS).then( res => {
        transactionCount = res
        console.log('nonce:', res)
    })
    let body = {
    "parameters": {
        "nonce": transactionCount,
        "wallet": process.env.ADDRESS,
        "market": "ETH-USDC",
        "type": "market",
        "side": "buy",
        "quoteOrderQuantity": "1000.00000000"
    },
    "signature": privateKey
    };
    // Important: use JSON.stringify for parameters in the body
    let stringifiedBody = JSON.stringify(body);

    let signature = crypto.createHmac("sha256", process.env.IDEX_API_SECRET).update(stringifiedBody).digest("hex");

    axios.post("https://api-matic.idex.io/v1/orders", body, {
        headers: {
        "IDEX-API-Key": process.env.IDEX_API_KEY,
        "IDEX-HMAC-Signature": signature,
        }
    })
    .then((response) => {
        console.log(response.data);
    })
    .catch((error) => {
        console.log(error);
    });
}
test()