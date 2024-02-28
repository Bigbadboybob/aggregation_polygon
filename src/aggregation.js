"use strict"
require('dotenv').config()
require('console.table')
const Web3 = require('web3')
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const web3 = new Web3(process.env.RPC_URL)
const coinDATA = require('./config')

const quickSwap = require('./quickswap')
const jetSwap = require('./jetswap')
const apeSwap = require('./apeswap')
const balancer = require('./balancer')
const dodo = require('./dodo')
const uniswap = require('./uniswap')
const exchanges = [quickSwap, jetSwap, dodo, balancer, uniswap, apeSwap]
//const exchanges = [uniswap]

const coins = coinDATA.coins
const indices = coinDATA.indices
const WMATIC = coinDATA.WMATIC
const DAI = coinDATA.DAI
const WETH = coinDATA.WETH
const USDC = coinDATA.USDC
const USDT = coinDATA.USDT
const WBTC = coinDATA.WBTC
const AAVE = coinDATA.AAVE

const prices = coinDATA.prices
const names = coinDATA.names
const tokenDecimals = coinDATA.tokenDecimals
const zeroAddress = coinDATA.zeroAddress

async function rates(quoteFunc, takerDollars = web3.utils.toBN('3000')) {
    if (quoteFunc == balancer.quote) {
        await balancer.getPools()
    } else if (quoteFunc == dodo.quote) {
        await dodo.getReturns(takerDollars)
    } else if (quoteFunc == uniswap.quote) {
        await uniswap.getReturns(takerDollars)
    } else if (quoteFunc == apeSwap.quote) {
        await apeSwap.getReturns(takerDollars)
    } else if (quoteFunc == jetSwap.quote) {
        await jetSwap.getReturns(takerDollars)
    }
    var rates = Array(coins.length)
    var data = Array(coins.length)
    //console.log("starting")
    for (let r = 0; r < coins.length; r++) {
        let row = Array(coins.length)
        let drow = Array(coins.length)
        let takerToken = coins[r]
        let amount = takerDollars.mul(web3.utils.toBN(String(Math.round(10**tokenDecimals[takerToken]/prices[takerToken]))))
        for (let c = 0; c < coins.length; c++) {
            //Maybe something more elegant
            if (r == c) {
                row[c] = 0
            } else{
                let makerToken = coins[c]
                //console.log(names[coins[r]]+names[coins[c]])
                let qProm = quoteFunc(takerToken, makerToken, amount)
                let amountResolve, dataResolve
                let qAmount = new Promise((resolve, reject) => {
                    amountResolve = resolve
                })
                let qData = new Promise((resolve, reject) => {
                    dataResolve = resolve
                })
                qProm.then( res => {
                    amountResolve(res[0])
                    dataResolve(res[1])
                })
                row[c] = qAmount
                drow[c] = qData
            }
        }
        let rowProm
        rowProm = Promise.all(row)
        let drowProm = Promise.all(drow)
        rates[r] = rowProm
        data[r] = drowProm
    }
    rates = await Promise.all(rates)
    data = await Promise.all(data)
    return [rates, data]
}

//TODO: add more exchanges
async function bestRates(takerDollars = web3.utils.toBN('3000')) {
    let rateMatrices = Array(exchanges.length)
    let dataMatrices = Array(exchanges.length)
    for (let e = 0; e < exchanges.length; e++) {
        console.log(e)
        //TODO: use Promise.all() instead of await
        let quotesProm = rates(exchanges[e].quote, takerDollars)
        let ratesProm =  new Promise ( (resolve, reject) => {
            quotesProm.then( res => {
                console.log("done", e)
                resolve(res[0])
            })
        })
        let dataProm =  new Promise ( (resolve, reject) => {
            quotesProm.then( res => resolve(res[1]))
        })
        rateMatrices[e] = ratesProm
        dataMatrices[e] = dataProm
        //console.log("rates:", rateMatrices[e])
        //console.log("data:", dataMatrices[e])
    }
    let rateMatricesProm = Promise.all(rateMatrices)
    let dataMatricesProm = Promise.all(dataMatrices)
    rateMatrices = await rateMatricesProm
    dataMatrices = await dataMatricesProm
    let ratesMatrix = []
    let protocolMatrix = []
    let dataMatrix = []
    for (let r = 0; r < coins.length; r++) {
        let row = []
        let pRow = []
        let dRow = []
        for (let c = 0; c < coins.length; c++) {
            let swapRates = Array(exchanges.length)
            for (let e = 0; e < exchanges.length; e++) {
                swapRates[e] = rateMatrices[e][r][c]
            }
            row[c] = 0
            pRow[c] = -1
            for (let e = 0; e < exchanges.length; e++) {
                if (rateMatrices[e][r][c] > row[c]) {
                    row[c] = rateMatrices[e][r][c]
                    pRow[c] = e
                    dRow[c] = dataMatrices[e][r][c]
                }
            }
            //console.log(names[coins[r]] + names[coins[c]])
            //console.log(swapRates)
        }
        ratesMatrix[r] = row
        protocolMatrix[r] = pRow
        dataMatrix[r] = dRow
    }
    //console.log('rates matrix')
    //console.log(ratesMatrix)
    return [ratesMatrix, protocolMatrix, dataMatrix]
}

//Add main function for async
//TODO: Add function to get returns from path
function getReturns(rates, path) {
    if (path[0] != path[path.length-1]) {
        console.log('incomplete arbitrage')
        console.log('start token: ' + names[path[0]])
        console.log('end token: ' + names[path[path.length]])
    }

    let returns = 0
    for (let s = 1; s < path.length; s++) {
        let taker = indices[path[s-1]]
        let maker = indices[path[s]]
        let rate = rates[taker][maker]
        //console.log(names[path[s-1]] + names[path[s]])
        //console.log(rate)
        returns += rate
    }
    return 2**-returns

}

function transform(rates) {
    for (let r = 0; r < coins.length; r++) {
        for (let c = 0; c < coins.length; c++) {
            rates[r][c] = -Math.log2(rates[r][c])
        }
    }
    return rates
}

//Takes in transformed matrix and returns list of paths of negative weight cycle. (best paths for each source for each length)
//Take best avg return per swap?
function bestSwaps(matrix) {
    //best paths and returns of each length for each coin
    var paths = Array(coins.length).fill(Array(coins.length)-1)
    var returns = Array(coins.length).fill(Array(coins.length)-1)
    for (let s = 0; s < coins.length; s++) {
        let minDist = Array(coins.length).fill(Infinity)
        minDist[s] = 0
        let minPath = Array(coins.length).fill([s])
        let pathsLengths = Array(coins.length)
        let returnsLengths = Array(coins.length)
        for (let v = 0; v < coins.length; v++) {
            for (let t = 0; t < coins.length; t++) {
                maker:
                for (let m = 0; m < coins.length; m++) {
                    //No returning to other middle tokens
                    for (let p = 1; p < minPath[t].length; p++) {
                        if (minPath[t][p] == m) {
                            continue maker
                        } 
                    }
                    let newDist = minDist[t] + matrix[t][m]
                    if (newDist < minDist[m]) {
                        minDist[m] = newDist
                        //Make a copy and tack on the new vertex
                        minPath[m] = minPath[t].map((x) => x)
                        minPath[m].push(m)
                    }
                    if (minDist[s] < 0) {
                        pathsLengths[minPath[s].length-3] = minPath[s]
                        returnsLengths[minPath[s].length-3] = 2**(-minDist[s])
                    }
                }
            }
        }
        paths[s] = pathsLengths
        returns[s] = returnsLengths

    }
    return [paths, returns]
}

function bestSwap(bestPaths, bestReturns) {
    var bestReturnAdj = 1
    var bestReturn = 1
    var bestPath = []
    for (let v = 0; v < bestReturns.length; v++) {
        for (let r = 0; r < bestReturns[0].length; r++) {
            if (bestReturns[v][r] > 1) {
                let Return = bestReturns[v][r]
                let returnAdj = (bestReturns[v][r])**(1/(bestPaths[v][r].length-1))
                if (returnAdj > bestReturnAdj) {
                    bestReturnAdj = returnAdj
                    bestPath = bestPaths[v][r]
                    bestReturn = Return
                }
            }
        }
    }
    return [bestPath, bestReturn]
}

function getSwapInfo(path, protocolMatrix, dataMatrix, transformedRates) {
    let swaps = []
    for (let t = 0; t < path.length - 1; t++) {
        let protocol = protocolMatrix[path[t]][path[t+1]]
        let data = dataMatrix[path[t]][path[t+1]]
        let swap = {
            takerToken: coins[path[t]],
            makerToken: coins[path[t+1]],
            protocol: protocol,
            data: data,
            expectedReturn: 2**(-transformedRates[path[t]][path[t+1]])
        }
        swaps.push(swap)
    }
    return swaps
}

async function main() {
    console.log("getting rates")
    let [matrix, protocols, data] = await bestRates()
    console.log("protocols: ", protocols)
    console.log("matrix:", matrix)
    transform(matrix)
    let [paths, returns] = bestSwaps(matrix)
    console.log('paths')
    console.log(paths)
    console.log('returns')
    console.log(returns)
    //TODO: not correct
    let [path, Return] = bestSwap(paths, returns)
    console.log('OPTIMAL PATH')
    console.log(path)
    console.log(Return)
    let swaps = getSwapInfo(path, protocols, data, matrix)
    console.log("swaps:", swaps)
    //console.log("first swap data:", swaps[0].data)

    let amountReturned = getReturns(matrix, [WETH, DAI, WETH])
    console.log(amountReturned)
    if (amountReturned >= 1) {
        console.log('profit')
        //clearInterval(ratesInterval)
    }

    amountReturned = getReturns(matrix, [WETH, USDC, WETH])
    console.log(amountReturned)
    if (amountReturned >= 1) {
        console.log('profit')
        //clearInterval(ratesInterval)
    }
}
//main()

async function init() {
    console.log("updating prices...")
    await coinDATA.updatePrices()
    consolge.log("updating decimals")
    await coinDATA.updateDecimals()
    console.log("updating dodo Pairs...")
    //TODO:make interval
    await dodo.getPairs()
}
var dodoInterval = setInterval(dodo.getPairs, 300000)

async function test() {
    await init()
    console.log('initialized')
    main()
    //var ratesInterval = setInterval(main, 20000)
}
//test()

async function bTest() {
    let res = await rates(balancer.quote, web3.utils.toBN("300"))
    console.log(res)
}
//bTest()

module.exports = {
    init, bestRates, transform, bestSwaps, bestSwap, getSwapInfo, getReturns
}