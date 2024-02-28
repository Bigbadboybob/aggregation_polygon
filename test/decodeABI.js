"use strict"
const _ = require('lodash')
require('dotenv').config()
const Web3 = require('web3')
const web3 = new Web3(process.env.RPC_URL)
const config = require("../src/config")

const arbitrageContract = new web3.eth.Contract(config.ARBITRAGE_ABI, config.ARBITRAGE_ADDRESS)
let swaps = [
    {
        swapAddr: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
        approveAddr: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
        swapData: '0x945bcec90000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000f00abdf50cad33bf4ea314b9a83234cfb1d965300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f00abdf50cad33bf4ea314b9a83234cfb1d9653000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003600000000000000000000000000000000000000000000000000000000061d8c0410000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000001000d34e5dd4d8f043557145598e4e2dc286b35fd4f0000000000000000000000680000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000001be46690c00000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000006df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000095c57af400000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa841740000000000000000000000008f3cf7ad23cd3cadbd9735aff958023239c6a0630000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000028fa6ae000000000000000000000000000000000000000000000000000000000000000000',
        takerAddr: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        takerAmount: '10000000000'
    },
    {
        swapAddr: '0xa222e6a71D1A1Dd5F279805fbe38d5329C1d0e70',
        approveAddr: '0x6D310348d5c12009854DFCf72e0DF9027e8cb4f4',
        swapData: '0xf87dc1b70000000000000000000000008f3cf7ad23cd3cadbd9735aff958023239c6a0630000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa84174626967626164626f79626f622072756c657321000000007ace4a302de2db17e200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000061d8c0410000000000000000000000000000000000000000000000000000000000000001000000000000000000000000aae10fa31e73287687ce56ec90f81a800361b898',
        takerAddr: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
        takerAmount: '0'
    }
]
const encoded = arbitrageContract.methods.myFlashLoanCall(swaps).encodeABI()
console.log(encoded)

const test =
 "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000004c0000000000000000000000000ba12222222228d8ba445958a75a0704d566bf2c800000000000000000000000000000000000000000000000000000000000000800000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa8417400000000000000000000000000000000000000000000000000000002540be40000000000000000000000000000000000000000000000000000000000000003c4945bcec90000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000f00abdf50cad33bf4ea314b9a83234cfb1d965300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f00abdf50cad33bf4ea314b9a83234cfb1d9653000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003600000000000000000000000000000000000000000000000000000000061d8c0410000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000001000d34e5dd4d8f043557145598e4e2dc286b35fd4f0000000000000000000000680000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000001be46690c00000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000006df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000095c57af400000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa841740000000000000000000000008f3cf7ad23cd3cadbd9735aff958023239c6a0630000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000028fa6ae00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a222e6a71d1a1dd5f279805fbe38d5329c1d0e7000000000000000000000000000000000000000000000000000000000000000800000000000000000000000008f3cf7ad23cd3cadbd9735aff958023239c6a06300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000144f87dc1b70000000000000000000000008f3cf7ad23cd3cadbd9735aff958023239c6a0630000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa84174626967626164626f79626f622072756c657321000000007ace4a302de2db17e200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000061d8c0410000000000000000000000000000000000000000000000000000000000000001000000000000000000000000aae10fa31e73287687ce56ec90f81a800361b89800000000000000000000000000000000000000000000000000000000"

 let inputs = [
        {
          "components": [
            {
              "internalType": "address",
              "name": "swapAddr",
              "type": "address"
            },
            {
              "internalType": "bytes",
              "name": "swapData",
              "type": "bytes"
            },
            {
              "internalType": "address",
              "name": "takerAddr",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "takerAmount",
              "type": "uint256"
            }
          ],
          "internalType": "struct MyV2FlashLoan.swap[]",
          "name": "swaps",
          "type": "tuple[]"
        }
      ]
let params = web3.eth.abi.decodeParameters(inputs , test)
console.log(params)
//console.log(params.swaps[0])