"use strict"
require('dotenv').config()
require('console.table')

const quickSwap = require("./quickswap")
const jetSwap = require("./jetswap")
const apeSwap = require("./apeswap")
const balancer = require("./balancer")
const uniswap = require("./uniswap")
const dodo = require("./dodo")
const exchanges = [quickSwap, jetSwap, dodo, balancer, uniswap, apeSwap]

const {init, transform, bestRates, bestSwaps, bestSwap, getSwapInfo, getReturns} = require("./aggregation")

const fs = require('fs')
//const express = require('express')
//const path = require('path')
//const http = require('http')
//const cors = require('cors')
const Web3 = require('web3')
//const axios = require('axios')
const moment = require('moment-timezone')
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const audio = require("./audio")
const DN = require('decimal.js')

const HDWalletProvider = require("@truffle/hdwallet-provider")
const mnemonic = require("../secrets.json").mnemonic;
const provider = new HDWalletProvider(mnemonic, process.env.SPARE_URL2)
const web3 = new Web3(provider)
const ganache = require("ganache-core")

//const web3 = new Web3(process.env.RPC_URL)
//TODO: Switch to new account
let accounts = [process.env.ADDRESS]
web3.eth.getAccounts((err, res) => {
    accounts = res
    console.log(accounts)
})
var transactionCount
web3.eth.getTransactionCount(accounts[0]).then( res => {
    transactionCount = res
    console.log('nonce:', res)
})

//const config = require('./config')
const {
    DAI, WETH, USDC, USDT, WBTC, AAVE, WMATIC,
    prices,
    names,
    tokenDecimals,
    zeroAddress,
    QUICKSWAP_ADDRESS, QUICKSWAP_ABI,
    QUICKSWAP_SWAP_ABI,
    ARBITRAGE_ADDRESS, ARBITRAGE_ABI,
    ERC20_ABI,
    ADDRESS_PROVIDER_ADDRESS, ADDRESS_PROVIDER_ABI,
} = require('./config')


const arbitrageContract = new web3.eth.Contract(ARBITRAGE_ABI, ARBITRAGE_ADDRESS)

const now = () => (moment().tz('America/New_York').format())


function httpGetAsync(theUrl) {
    return new Promise((resolve, reject) => {
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.onreadystatechange = function() { 
            if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
                resolve(xmlHttp.responseText);
            }
        }
        xmlHttp.open("GET", theUrl, true); // true for asynchronous 
        xmlHttp.send(null);
    })
}

function getGas() {
    return httpGetAsync('https://gasstation-mainnet.matic.network/')
}

//For now returns profit per starting token and fees in wei
//Later change to return max extractable profit, starting amount and pools
const slipConst = 1
const tradeSize = 3000 //dollars
const flatGas = web3.utils.toBN(process.env.ESTIMATED_GAS.toString())
const tradeGas = web3.utils.toBN(process.env.SWAP_GAS.toString())
function checkArb(gasP) {
    return new Promise(async (resolve, reject) => {
        //GAS STUFF
        //TODO: clean up and compute gas amount
        if (isNaN(gasP) || gasP == 0) {
            gasP = 2000
        }
        let gasPrice = web3.utils.toBN(web3.utils.toWei(String(gasP), "gwei")) //in wei

        //AGGREGATION
        console.log("getting rates...")
        let [matrix, protocols, data] = await bestRates(web3.utils.toBN(String(tradeSize)))
        console.log("protocols: ", protocols)
        transform(matrix)
        let [paths, returns] = bestSwaps(matrix)
        console.log('paths')
        console.log(paths)
        console.log('returns')
        console.log(returns)
        let [path, Return] = bestSwap(paths, returns)
        console.log(Date.now()/1000)
        console.log("WMATIC Price:", (2**-matrix[0][2]))
        console.log('OPTIMAL PATH')
        console.log(path)
        console.log(Return)

        let gas = flatGas.add(tradeGas.muln(path.length > 0 ? path.length-1 : 2))
        let fees = gasPrice.mul(gas)
        fees = fees.muln(prices[WMATIC]) // rough estimate of dollars(18 decimal)/wei
        let round = web3.utils.toBN(String(10**16))
        fees = fees.div(round).mul(round) //round
        let dollarFees = fees
        let dollarNumFees = dollarFees.div(web3.utils.toBN(String(10**9))).toNumber()/10**9

        if (Return > 1) {
            let swaps = getSwapInfo(path, protocols, data, matrix)
            console.log('PROFIT no fees')
            console.log(swaps)

            let takerToken = swaps[0].takerToken
            fees = fees.div(web3.utils.toBN(String(10**(18-tokenDecimals[takerToken])))) //taker token decimals but still dollars
            fees = fees.divn(prices[takerToken])

            let slipReturn = Return*(slipConst**(swaps.length))-dollarNumFees/tradeSize
            console.log("gas fees:", dollarNumFees)
            console.log("slip Return", slipReturn)
            if (slipReturn > 1) {
                console.log('EXECUTING TRADE')
                console.log(Date.now()/1000)
                audio.playDing()
                let receipt = await executeTrade(swaps, gasPrice.toNumber(), gas.toNumber(), slipReturn)
                console.log(receipt)
                //clearInterval(mainInterval)
                resolve([true, Return, (Return-1)*tradeSize], path)
            }

            resolve([false, Return, (Return-1)*tradeSize], path)
        } else {
            let testReturns = getReturns(matrix, [WETH, DAI, WETH])
            let testReturns2 = getReturns(matrix, [USDC, WMATIC, USDC])
            resolve([false, testReturns2, testReturns, dollarNumFees])
        }
    })
}


var trades = []
//TODO: test all paths
async function executeTrade(swaps, gasPrice, gas, expectedReturn) {
    /*
    await getGas().then(gasJSON => {
        gasPrice = JSON.parse(gasJSON)['fastest']
        gasPrice = parseInt(gasPrice)+10
        gasPrice *= 10**9 //gwei
    })
    */
    console.log("executing...")
    console.log("gas:", gas)
    console.log("gas price:", gasPrice)
    const swapData = []
    let firstExchange = exchanges[swaps[0].protocol]
    /*
    if (firstExchange == dodo) {
        console.log(swaps[0].data.pathPools)
        console.log(swaps[0].data.directions)
        dodo.debug()
    }
    */
    let firstSwap = {
        swapAddr: swaps[0].data.swapAddr,
        approveAddr: swaps[0].data.approveAddr,
        swapData: firstExchange.trnscData(swaps[0].takerToken, swaps[0].makerToken, swaps[0].data, process.env.CONTRACT_ADDRESS),
        takerAddr: swaps[0].takerToken,
        takerAmount: swaps[0].data.total
    }
    console.log("Takeramount0:", firstSwap.takerAmount)
    swapData.push(firstSwap)
    for (let i = 1; i < swaps.length; i++) {
        console.log(i)
        let swap = swaps[i]
        const exchange = exchanges[swap.protocol]
        /*
        if (exchange == dodo) {
            console.log(swap.data.pathPools)
            console.log(swap.data.directions)
            dodo.debug()
        }
        */
        const callData = exchange.trnscDataNoAmount(swap.takerToken, swap.makerToken, swap.data, process.env.CONTRACT_ADDRESS)
        let takerAmount = "0"
        if (exchanges[swap.protocol] == balancer) {
            takerAmount = DN(swap.data.total).minus(swap.data.amountsIn[0].times(DN(10).pow(tokenDecimals[swap.takerToken]))).toString()
        }
        let swapDatum = {
            swapAddr: swap.data.swapAddr,
            approveAddr: swap.data.approveAddr,
            swapData: callData,
            takerAddr: swap.takerToken,
            //takerAmount is only for first swap and rest of amount for balancer swaps
            takerAmount: takerAmount
        }
        swapData.push(swapDatum)
    }
    console.log("swapData:")
    for (const swap of swapData) {
        console.log(swap)
        console.log(swap.takerAmount.toString())
    }

    let execute = false
    console.log('testing using estimateGas...')

    //TODO: properly check for revert
    await arbitrageContract.methods.myFlashLoanCall(swapData).estimateGas({
        from: accounts[0], gas: gas, gasPrice: gasPrice, nonce: transactionCount
        }).then( async function (res) {
            console.log("then")
            console.log(res)
            let fees = (gasPrice/10**9)*res*prices[WMATIC]/10**9
            console.log("Expected Gas Cost:", fees)
            execute = true
        }).catch(async function (err, res) {
            console.log('catch')
            console.log('RESULT:', res)
            console.log('ERROR:', err)
        })

    if (execute) {
        audio.playDing()
        const takerContract = new web3.eth.Contract(ERC20_ABI, swaps[0].takerToken)
        let balBefore = await takerContract.methods.balanceOf(ARBITRAGE_ADDRESS).call()
        clearInterval(mainInterval)
        console.log('EXECUTING')
        const tx = await arbitrageContract.methods.myFlashLoanCall(swapData).send({
            from: accounts[0], gas: gas, gasPrice: gasPrice, nonce: transactionCount
            }).then((err, res) => {
                audio.playCash()
                console.log('then')
                console.log('RESULT:', res)
                console.log('ERROR:', err)
            }).catch((err, res) => {
                console.log('catch')
                console.log('RESULT:', res)
                console.log('ERROR:', err)
            })
        
        let bal = await takerContract.methods.balanceOf(ARBITRAGE_ADDRESS).call()
        let balDif = bal - balBefore
        console.log('Balance:', balDif)
        var trade
        if (balDif > 0) {
            trade = [true, balDif, Date.now()/1000, expectedReturn, tradeSize]
        } else {
            trade = [false, balDif, Date.now()/1000, expectedReturn, tradeSize]
        }
        swapData.forEach( swap => trade.push(names[swap.takerAddr]))
        trades.push(trade)
        fs.appendFile('src/logs/trades.txt', JSON.stringify(trade) + '\n', err => {
            if (err != null) {
                console.log(err)
            }
        })
        transaction = false
        transactionCount = await web3.eth.getTransactionCount(accounts[0])
        //mainInterval = setInterval(arbChecks, 3000)
        return 'EXECUTED'
    } else {
        transaction = false
        return 'NOT EXECUTED'
    }
}


let gasPrice = 2000 //high start just before init

/*
checkArb(LINK, WETH, gasPrice).then(res => {
    console.log(res)
}).catch(error => {
    console.log(error)
})

checkArb(WBTC, WETH, gasPrice).then(res => {
    console.log('WBTC->WETH->WBTC')
    console.log(res)
    if (res[4]) {
        console.log("PROFIT")
    }
})
*/


let time = 0;

let updateGas = true
setInterval( () => {
    updateGas = true
}, 10000)

function updateNonce() {
    web3.eth.getTransactionCount(accounts[0]).then( res => {
        transactionCount = res
        console.log('nonce:', res)
    })
}

setInterval( () => {
    updateNonce()
}, 100000)


const arbChecks = async () => {
    while(true) {
        console.log("check")
        if (updateGas) {
            getGas().then(gasJSON => {
                gasPrice = JSON.parse(gasJSON)['fastest']
                gasPrice = parseInt(gasPrice)+10
            })
            updateGas = false
        }
            time++
        //get best swap and check if profitable
        let arbCheck = checkArb(gasPrice).then((res, err) => {
            console.log(res)
        })
        let timeOut = new Promise((resolve) => setTimeout(() => resolve(true), 15000))
        await Promise.all([arbCheck, timeOut])

        if (time >= 200) {
            //TODO: update price using median of aggregation matrix with dai, usdc usdt from all exchanges
            console.log(trades)
            //fs.writeFile('src/logs/profits.txt', JSON.stringify(profits), err => console.log(err))
            console.log(transaction)
            transaction = false
            time = 0
        }
    }
}

var mainInterval
var arbInterval
var transaction
async function main() {
    await init()
    //mainInterval = setInterval(arbChecks, 30000)
    arbChecks()
    arbInterval = true
    transaction = false
}
main()


