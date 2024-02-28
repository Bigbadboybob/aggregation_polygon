const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
require('dotenv').config()
const Web3 = require('web3')
const web3 = new Web3(process.env.RPC_URL)
const DN = require('decimal.js')
DN.set({toExpPos: 100, toExpNeg: -100})

const coinDATA = require('./config')

const WMATIC = coinDATA.WMATIC
const DAI = coinDATA.DAI
const WETH = coinDATA.WETH
const USDC = coinDATA.USDC
const USDT = coinDATA.USDT
const WBTC = coinDATA.WBTC
const AAVE = coinDATA.AAVE

const coins = coinDATA.coins
const allCoins = coinDATA.allCoins
const prices = coinDATA.prices
const names = coinDATA.names
const tokenDecimals = coinDATA.tokenDecimals
const indices = coinDATA.indices
const zeroAddress = coinDATA.zeroAddress

const dodoAddress = coinDATA.DODO_PROXY_ADDRESS
const dodoApproveAddress = coinDATA.DODO_APPROVE
const dodoPoolABI = coinDATA.DODO_POOL_ABI
const dodoPoolsContract = new web3.eth.Contract(coinDATA.DODO_POOLS_ABI, coinDATA.DODO_POOLS_ADDRESS)
const dodoProxyContract = new web3.eth.Contract(coinDATA.DODO_PROXY_ABI , dodoAddress)

var PAIRS = Array(allCoins.length)
for (let i = 0; i < allCoins.length; i++) {
    PAIRS[i] = Array(allCoins.length)
}
var RATES = Array(allCoins.length)
for (let i = 0; i < allCoins.length; i++) {
    RATES[i] = Array(allCoins.length)
}
var SWAPS = Array(allCoins.length)
for (let i = 0; i < allCoins.length; i++) {
    SWAPS[i] = Array(allCoins.length)
}

var PATHS = Array(coins.length)
var PATHRETURNS = Array(coins.length)

function getSwapAddr(data) {
    return dodoAddress
}

async function getPairs() {
    let allProms = []
    for (let b = 0; b < allCoins.length; b++) {
        let row = []
        for (let q = 0; q < allCoins.length; q++) {
            if (b == q) {
                continue
            }
            let pairProm = dodoPoolsContract.methods.getDODOPool(allCoins[b], allCoins[q]).call().then( res => {
                let contracts = []
                res.forEach( (addr, i, array) => contracts[i] = new web3.eth.Contract(dodoPoolABI, addr))
                PAIRS[b][q] = contracts
            }).catch( err => {
                //console.log("dodo pool error:", err)
            })
            row.push(pairProm)
        }
        allProms.push(Promise.all(row))
    }
    await Promise.all(allProms)
    return true
}

function getTokenPairs(takerIndex, makerIndex) {
    let basePairs = PAIRS[takerIndex][makerIndex]
    let quotePairs = PAIRS[makerIndex][takerIndex]
    return [basePairs, quotePairs]
}

async function getBestPair(takerToken, makerToken, takerAmount) {
    let [basePairs, quotePairs] = getTokenPairs(indices[takerToken], indices[makerToken])
    let baseResults = []
    let quoteResults = []
    let allProms = []
    for (let b = 0; b < basePairs.length; b++) {
        let pair = basePairs[b]
        let prom = pair.methods.querySellBase(process.env.CONTRACT_ADDRESS, takerAmount.toString()).call().then( res => {
            baseResults[b] = res.receiveQuoteAmount
        }).catch( err => {
            console.log("dodo:",err)
            baseResults[b] = 0
        })
        allProms.push(prom)
    }
    for (let q = 0; q < quotePairs.length; q++) {
        let pair = quotePairs[q]
        let prom = pair.methods.querySellQuote(process.env.CONTRACT_ADDRESS, takerAmount.toString()).call().then( res => {
            quoteResults[q]= (res.receiveBaseAmount)
        }).catch( err => {
            console.log("dodo:",err)
            quoteResults[q] = 0
        })
        allProms.push(prom)
    }
    await Promise.all(allProms)
    let bestPair = ""
    let bestOut = DN(0)
    let direction = -1
    //console.log("baseResults ", baseResults)
    //console.log("quoteResults ", quoteResults)
    for (let p = 0; p < baseResults.length; p++) {
        let out = DN(baseResults[p])
        if (out.gt(bestOut)) {
            bestOut = out
            bestPair = basePairs[p]._address
            direction = 0
        }
    }
    for (let p = 0; p < quoteResults.length; p++) {
        let out = DN(quoteResults[p])
        if (out.gt(bestOut)) {
            bestOut = out
            bestPair = quotePairs[p]._address
            direction = 1
        }
    }
    return [bestOut, bestPair, direction]
}

//Get the best rate and pool for taker->maker and maker->taker
async function getBestBidirectional(takerIndex, makerIndex, takerDollars) {
    let takerToken = allCoins[takerIndex]
    let makerToken = allCoins[makerIndex]
    let takerDecimals = 18
    let makerDecimals = 18
    if (tokenDecimals[takerToken]) {
        takerDecimals = tokenDecimals[takerToken]
    }
    if (tokenDecimals[makerToken]) {
        makerDecimals = tokenDecimals[makerToken]
    }
    let takerAmount = DN(takerDollars).times(DN(10).pow(takerDecimals)).div(prices[takerToken]).toNearest(1)
    let makerAmount = DN(takerDollars).times(DN(10).pow(makerDecimals)).div(prices[makerToken]).toNearest(1)
    let [basePairs, quotePairs] = getTokenPairs(takerIndex, makerIndex)
    let baseResults = []
    let quoteResults = []
    let allProms = []
    let baseResultsM = []
    let quoteResultsM = []
    let allPromsM = []
    for (let b = 0; b < basePairs.length; b++) {
        let pair = basePairs[b]
        let prom = pair.methods.querySellBase(process.env.CONTRACT_ADDRESS, takerAmount.toString()).call().then( res => {
            baseResults[b] = res.receiveQuoteAmount
        }).catch( err => {
            baseResults[b] = 0
        })
        allProms.push(prom)
        prom = pair.methods.querySellQuote(process.env.CONTRACT_ADDRESS, makerAmount.toString()).call().then( res => {
            quoteResultsM[b] = res.receiveBaseAmount
        }).catch( err => {
            quoteResultsM[b] = 0
        })
        allPromsM.push(prom)
    }
    for (let q = 0; q < quotePairs.length; q++) {
        let pair = quotePairs[q]
        let prom = pair.methods.querySellQuote(process.env.CONTRACT_ADDRESS, takerAmount.toString()).call().then( res => {
            quoteResults[q]= (res.receiveBaseAmount)
        }).catch( err => {
            quoteResults[q] = 0
        })
        allProms.push(prom)
        prom = pair.methods.querySellBase(process.env.CONTRACT_ADDRESS, makerAmount.toString()).call().then( res => {
            baseResultsM[q]= (res.receiveQuoteAmount)
        }).catch( err => {
            baseResultsM[q] = 0
        })
        allPromsM.push(prom)
    }

    await Promise.all(allProms)
    //console.log(names[takerToken]+names[makerToken])
    //console.log(baseResults)
    //console.log(quoteResults)
    let bestPair = ""
    let bestOut = DN(0)
    let direction = -1
    for (let p = 0; p < baseResults.length; p++) {
        let out = DN(baseResults[p])
        if (out.gt(bestOut)) {
            bestOut = out
            bestPair = basePairs[p]._address
            direction = 0
        }
    }
    for (let p = 0; p < quoteResults.length; p++) {
        let out = DN(quoteResults[p])
        if (out.gt(bestOut)) {
            bestOut = out
            bestPair = quotePairs[p]._address
            direction = 1
        }
    }

    await Promise.all(allPromsM)
    //console.log(names[makerToken]+names[takerToken])
    //console.log(baseResultsM)
    //console.log(quoteResultsM)
    let bestPairM = ""
    let bestOutM = DN(0)
    let directionM = -1
    for (let p = 0; p < quoteResultsM.length; p++) {
        let out = DN(quoteResultsM[p])
        if (out.gt(bestOutM)) {
            bestOutM = out
            bestPairM = basePairs[p]._address
            directionM = 1
        }
    }
    for (let p = 0; p < baseResultsM.length; p++) {
        let out = DN(baseResultsM[p])
        if (out.gt(bestOutM)) {
            bestOutM = out
            bestPairM = quotePairs[p]._address
            directionM = 0
        }
    }
    return [[bestOut.div(takerAmount), bestPair, direction], [bestOutM.div(makerAmount), bestPairM, directionM]]
}

//fill matrix of best rates and pool and direction
async function fillBestSwaps(takerDollars) {
    let allProms = []
    for (let b = 0; b < PAIRS.length; b++) {
        let rowProm = []
        for (let q = b + 1; q < PAIRS.length; q++) {
            //check if no price
            if (prices[allCoins[b]] && prices[allCoins[q]]) {
                //console.log("pairs", String(b).concat(String(q)))
                let sProm = getBestBidirectional(b, q, takerDollars).then( res => {
                    if (res && RATES[b] && RATES[q]) {
                        RATES[b][q] = DN(res[0][0]).times(0.997)
                        SWAPS[b][q] = {
                            pairAddr: res[0][1],
                            direction: res[0][2]
                        }
                        RATES[q][b] = DN(res[1][0]).times(0.997)
                        SWAPS[q][b] = {
                            pairAddr: res[1][1],
                            direction: res[1][2]
                        }
                    } else {
                        console.log("dodo swap response undefined")
                        console.log(res)
                        console.log(b)
                        console.log(RATES[b])
                        console.log(q)
                        console.log(RATES[q])
                        console.log(RATES)
                    }
                })
                rowProm.push(sProm)
            }
        }
        allProms.push(Promise.all(rowProm))
    }
    let allPromises = Promise.all(allProms)
    let timeOut = new Promise((resolve) => setTimeout(() => resolve(false), 10000))
    await Promise.race([allPromises, timeOut])
}

function transform(rates) {
    for (let r = 0; r < rates.length; r++) {
        for (let c = 0; c < rates.length; c++) {
            if (rates[r][c]) {
                //let temp = rates[r][c]
                if (DN.isDecimal(rates[r][c])) {
                    rates[r][c] = rates[r][c].log(2).neg().toNumber()
                } else {
                    rates[r][c] = Infinity
                }
                /*
                if (rates[r][c] == Infinity || rates[r][c] == -Infinity) {
                    console.log("inifinity: ", temp)
                    console.log("inifinity: ", rates[r][c])
                }
                */
            }
        }
    }
    return rates
}

//finds best paths between starting coins
function bestSwapsStarting(s) {
    var paths = Array(coins.length)
    var returns = Array(coins.length)
    let minDist = Array(allCoins.length).fill(Infinity)
    minDist[s] = 0
    let minPath = Array(allCoins.length).fill([s])
    for (let v = 0; v < coins.length; v++) {
        for (let t = 0; t < allCoins.length; t++) {
            maker:
            for (let m = 0; m < allCoins.length; m++) {
                //No returning to other middle tokens
                for (let p = 1; p < minPath[t].length; p++) {
                    if (minPath[t][p] == m) {
                        continue maker
                    } 
                }
                let newDist = minDist[t] + RATES[t][m]
                if (newDist < minDist[m]) {
                    minDist[m] = newDist
                    //Make a copy and tack on the new vertex
                    minPath[m] = minPath[t].map((x) => x)
                    minPath[m].push(m)
                }
            }
        }
    }
    for (let m = 0; m < coins.length; m++) {
        if (m != s) {
            paths[m] = minPath[m]
            returns[m] = 2**(-minDist[m])
        }
    }
    return [returns, paths]
}

function bestSwaps() {
    for (let s = 0; s < coins.length; s++) {
        let [returns, paths] = bestSwapsStarting(s)
        PATHRETURNS[s] = returns
        PATHS[s] = paths
    }
}

async function getReturns(takerDollars) {
    await fillBestSwaps(takerDollars.toString())
    RATES = transform(RATES)
    bestSwaps()
    //console.log(PATHS)
    //console.log(PATHRETURNS)
}

function debug() {
    console.log("RATES:", RATES)
    console.log("PATHRETURNS:", PATHRETURNS)
    //console.log("SWAPS:", SWAPS)
}

//Assumes bestSwaps() already called
//TODO: maybe convert rates to DN
function quote(takerToken, makerToken, takerAmount) {
    let t = indices[takerToken]
    let m = indices[makerToken]
    let qProm = new Promise( (resolve, reject) => {
            let qRate = DN(PATHRETURNS[t][m]).times(DN(10).pow(tokenDecimals[takerToken]-tokenDecimals[makerToken])).toNumber()
            //TODO: fix thix bug
            if (qRate == Infinity) {
                console.log("dodo: infinity")
                qRate = 0
            }
            let path = PATHS[t][m]
            let pathPools = []
            let directions = []
            for (let p = 0; p < path.length-1; p++) {
                pathPools[p] = SWAPS[path[p]][path[p+1]].pairAddr
                directions[p] = SWAPS[path[p]][path[p+1]].direction
            }
            let qData = {
                total: takerAmount.toString(),
                returnAmount: DN(PATHRETURNS[t][m]).times(takerAmount.toString()).toNearest(1).toString(),
                swapAddr: dodoAddress,
                approveAddr: dodoApproveAddress,
                pathPools: pathPools,
                directions: directions
            }
            resolve([qRate, qData])
    })
    return qProm
}

function trnscData(takerToken, makerToken, data, addr) {
    let directions = 0
    for (let b = 0; b < data.directions.length; b++) {
        if (data.directions[b] == 1) {
            directions += 2**b
        }
    }
    let callData = dodoProxyContract.methods.dodoSwapV2TokenToToken(takerToken, makerToken, data.total, "1", data.pathPools, directions, false, String(Math.round(Date.now()/1000) + 600)).encodeABI()
    return callData
}

/*
HEX: 626967626164626F79626F622072756C65732100{8 byte/16 hex unique id}E2DB17E2
HEX: 626967626164626F79626F622072756C657321000000007ACE4A302DE2DB17E2
HEX: 626967626164626F79626F622072756C657321000000000000031207E2DB17E2
*/
function trnscDataNoAmount(takerToken, makerToken, data, addr) {
    let directions = 0
    for (let b = 0; b < data.directions.length; b++) {
        if (data.directions[b] == 1) {
            directions += 2**b
        }
    }
    let callData = dodoProxyContract.methods.dodoSwapV2TokenToToken(takerToken, makerToken, "44512891635166917309470866438905221514771660592425113995951798165235625039842",
    "1", data.pathPools, directions, false, String(Math.round(Date.now()/1000) + 600)).encodeABI()
    return callData
}

async function swapsTest() {
    console.log("swaps test")
    await coinDATA.updatePrices()
    await getPairs()
    console.log(PAIRS.length)
    await fillBestSwaps(3000)
    console.log(RATES[0])
    console.log(SWAPS[1][2])
    RATES = transform(RATES)
    bestSwaps()
    console.log(PATHRETURNS)
    console.log(PATHS)
    let q = await quote(AAVE, WBTC, web3.utils.toWei("15", "ether"))
    console.log('done')
    console.log(q)
    q = await quote(DAI, USDC, web3.utils.toWei("3000", "ether"))
    console.log(q)
    console.log("with:", trnscData(WETH, USDC, q[1], process.env.CONTRACT_ADDRESS))
    console.log("without:", trnscDataNoAmount(WETH, USDC, q[1], process.env.CONTRACT_ADDRESS))
}
//swapsTest()

function test() {
    console.log(dodoProxyContract.methods)
}
//test()

async function getBestTest() {
    await getPairs()
    //console.log("all pairs:", PAIRS)
    let res = await getBestPair(WETH, USDC, web3.utils.toWei("10", "ether"))
    let res1 = await getBestPair(USDC, WETH, 34000000000)
    let res2 = await getBestBidirectional(WETH, USDC, 34000)
    console.log(res)
    console.log(res1)
    console.log(res2)
}
//getBestTest()

module.exports = {
    quote,
    getPairs, getReturns, debug,
    trnscData, trnscDataNoAmount, getSwapAddr
}



function httpGetAsync(theUrl) {
    //console.log(theUrl)
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

function getDodo(extension) {
    return httpGetAsync('https://route-api.dodoex.io/dodoapi/getdodoroute' + extension)
}


function getSwap(takerToken, makerToken, amount) {
    return new Promise((resolve, reject) => {
        getDodo('?fromTokenAddress=' + takerToken
        + '&fromTokenDecimals=' + String(tokenDecimals[takerToken])
        + '&toTokenAddress=' + makerToken
        + '&toTokenDecimals=' + String(tokenDecimals[makerToken])
        + '&fromAmount=' + amount.toString()
        + '&slippage=50'
        + '&userAddr=' + process.env.CONTRACT_ADDRESS
        + '&chainId=137' 
        + '&rpc=' + process.env.SPARE_URL3 //web3.currentProvider.url
        + '&source=dodo'
        ).then( text => {
            quote = JSON.parse(text)
            resolve(quote)
        }).catch( err => {
            reject(err)
        })
    })
}

function quoteAPI(takerToken, makerToken, takerAmount) {
    let qProm = new Promise( (resolve, reject) => {
        if (takerToken == WBTC || takerToken == AAVE || takerToken == USDT
            || makerToken == WBTC || makerToken == AAVE || makerToken == USDT) {
            resolve([0, {total: takerAmount.toString(), returnAmount: "0"}])
        }
        getSwap(takerToken, makerToken, takerAmount).then( res => {
            //console.log(res)
            if (res.status == 607) {
                console.log("nodata")
                resolve([0, {total: takerAmount.toString(), returnAmount: "0"}])
            } else {
                let qRate = res.data.resPricePerFromToken
                let qData = {
                    total: takerAmount.toString(),
                    returnAmount: DN(res.data.resAmount).times(10**tokenDecimals[makerToken]).toNearest(1).toString(),
                    callData: res.data.data,
                    swapAddr: res.data.to, //0xa222e6a71D1A1Dd5F279805fbe38d5329C1d0e70
                    approveAddr: res.data.targetApproveAddr
                }
                resolve([qRate, qData])
            }
        }).catch( err => {
            console.log("ERROR: dodo")
            console.log(err)
            //switchProvider()
            resolve([0, {total: takerAmount.toString(), returnAmount: "0"}])
        })
    })
    let timeOut = new Promise((resolve) => setTimeout(() => resolve([0, {total: takerAmount.toString(), returnAmount: "0"}]), 5000))
    return Promise.race([qProm, timeOut])
}