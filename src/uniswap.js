const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
require('dotenv').config()
const Web3 = require('web3')
const web3 = new Web3(process.env.RPC_URL2)
const DN = require('decimal.js')
DN.set({toExpPos: 100, toExpNeg: -100})
let p = true

const coinDATA = require('./config')

const WMATIC = coinDATA.WMATIC
const DAI = coinDATA.DAI
const WETH = coinDATA.WETH
const USDC = coinDATA.USDC
const USDT = coinDATA.USDT
const WBTC = coinDATA.WBTC
const AAVE = coinDATA.AAVE

const coins = coinDATA.coins
const indices = coinDATA.indices
const stableCoins = coinDATA.stableCoins
const allCoins = coinDATA.allCoins
const prices = coinDATA.prices
const names = coinDATA.names
const tokenDecimals = coinDATA.tokenDecimals
const zeroAddress = coinDATA.zeroAddress

const quoteABI = coinDATA.UNIQUOTE_ABI
const quoteAddress = coinDATA.UNIQUOTE_ADDRESS
const quoteContract = new web3.eth.Contract(quoteABI, quoteAddress)
const uniABI = coinDATA.UNISWAP_ABI
const uniAddress = coinDATA.UNISWAP_ADDRESS
const uniContract = new web3.eth.Contract(uniABI, uniAddress)

var RATES = Array(allCoins.length)
for (let i = 0; i < allCoins.length; i++) {
    RATES[i] = Array(allCoins.length)
}
var PATHS = Array(coins.length)
var PATHRETURNS = Array(coins.length)

function uniData(takerToken, makerToken, takerAmount, fee) {
    return quoteContract.methods.quoteExactInputSingle(takerToken, makerToken, fee*10000, takerAmount.toString(), 0).call()
}
//uniData(DAI, USDC, web3.utils.toBN("1000000000000000000000"), 0.05).then( res => console.log(res))

async function getRates(takerDollars) {
    let allProms = []
    let fee = 0
    for (let t = 0; t < coins.length; t++) {
        let takerToken = allCoins[t]
        if (!prices[takerToken]) continue
        let takerDecimals = 18
        if (tokenDecimals[takerToken]) {
            takerDecimals = tokenDecimals[takerToken]
        }
        let takerAmount = DN(takerDollars).times(DN(10).pow(takerDecimals)).div(prices[takerToken]).toNearest(1)
        let row = []
        for (let m = 0; m < coins.length; m++) {
            let makerToken = allCoins[m]
            let makerDecimals = 18
            if (tokenDecimals[makerToken]) {
                makerDecimals = tokenDecimals[makerToken]
            }
            //let decimalDif = DN("10").pow(takerDecimals-makerDecimals)
            if (stableCoins.includes(takerToken) && stableCoins.includes(makerToken)) {
                fee = 0.05
            } else if (coins.includes(takerToken) && coins.includes(makerToken)){
                fee = 0.3
            } else {
                fee = 1
            }
            let prom = uniData(allCoins[t], allCoins[m], takerAmount, fee).then( res => {
                //console.log(res)
                RATES[t][m] = DN(res).div(DN(String(takerAmount))).mul(1 - fee/100)
            }).catch( err => {
                RATES[t][m] = DN(0)
            })
            row.push(prom)
        }
        allProms.push(Promise.all(row))
    }
    let timeOut = new Promise((resolve) => setTimeout(() => resolve(false), 10000))
    let allPromises = Promise.all(allProms)
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
    console.log("getting returns...")
    await getRates(takerDollars.toString())
    RATES = transform(RATES)
    bestSwaps()
}


function getSwapAddr() {
    return coinDATA.UNISWAP_ADDRESS
}


function quote(takerToken, makerToken, takerAmount) {
    let t = indices[takerToken]
    let m = indices[makerToken]
    let qProm = new Promise( (resolve, reject) => {
            let qRate = DN(PATHRETURNS[t][m]).times(DN(10).pow(tokenDecimals[takerToken]-tokenDecimals[makerToken])).toNumber()
            //TODO: fix this bug
            if (qRate == Infinity) {
                console.log("uniswap: infinity")
                qRate = 0
            }
            let path = PATHS[t][m]
            let qData = {
                total: takerAmount.toString(),
                returnAmount: DN(PATHRETURNS[t][m]).times(takerAmount.toString()).toNearest(1).toString(),
                swapAddr: getSwapAddr(),
                approveAddr: getSwapAddr(),
                path: path,
            }
            resolve([qRate, qData])
    })
    return qProm
}

//TODO: fees
function trnscData(takerToken, makerToken, data, addr) {
    let takerAmount = data.total
    let deadline = Math.round(Date.now()/1000 + 60)
    let packedEncoded = "0x" + allCoins[data.path[0]].slice(2)
    for (let p = 1; p < data.path.length; p++) {
        let takerToken = allCoins[data.path[p-1]]
        let makerToken = allCoins[data.path[p]]
        if (stableCoins.includes(takerToken) && stableCoins.includes(makerToken)) {
            fee = "0001f4" //500
        } else if (coins.includes(takerToken) && coins.includes(makerToken)) {
            fee = "000bb8" //3000
        } else {
            fee = "0002710" //10000
            feeNum = 10000
        }
        packedEncoded = packedEncoded.concat(fee).concat(makerToken.slice(2))
    }
    let swapStruct = {
        path: packedEncoded,
        recipient: addr,
        deadline: deadline,
        amountIn: takerAmount,
        amountOutMinimum: 0,
    }
    return uniContract.methods.exactInput(swapStruct).encodeABI()
}

/*
HEX: 626967626164626F79626F622072756C65732100{8 byte/16 hex unique id}E2DB17E2
HEX: 626967626164626F79626F622072756C657321000000007ACE4A302DE2DB17E2
HEX: 626967626164626F79626F622072756C657321000000000000031207E2DB17E2
*/
function trnscDataNoAmount(takerToken, makerToken, data, addr) {
    let takerAmount = "44512891635166917309470866438905221514771660592425113995951798165235625039842"
    let deadline = Math.round(Date.now()/1000 + 60)
    let packedEncoded = "0x" + allCoins[data.path[0]].slice(2)
    for (let p = 1; p < data.path.length; p++) {
        let takerToken = allCoins[data.path[p-1]]
        let makerToken = allCoins[data.path[p]]
        if (stableCoins.includes(takerToken) && stableCoins.includes(makerToken)) {
            fee = "0001f4" //500
        } else if (coins.includes(takerToken) && coins.includes(makerToken)) {
            fee = "000bb8" //3000
        } else {
            fee = "0002710" //10000
            feeNum = 10000
        }
        packedEncoded = packedEncoded.concat(fee).concat(makerToken.slice(2))
    }
    let swapStruct = {
        path: packedEncoded,
        recipient: addr,
        deadline: deadline,
        amountIn: takerAmount,
        amountOutMinimum: 0,
    }
    return uniContract.methods.exactInput(swapStruct).encodeABI()
}

async function main() {
    await coinDATA.updatePrices()
    console.log("prices")
    await getReturns(web3.utils.toBN("3000"))
    console.log("returns")
    console.log(PATHRETURNS)
    let rate = quote(WBTC, USDC, web3.utils.toBN("1").mul(web3.utils.toBN(String(10**tokenDecimals[WBTC]))))
    console.log(rate)
}
//main()

async function trnscTest() {
    await coinDATA.updatePrices()
    await getReturns(web3.utils.toBN("3000"))
    let q = await quote(USDC, WMATIC, web3.utils.toBN("1").mul(web3.utils.toBN(String(10**tokenDecimals[WBTC]))))
    console.log(q)
    let encoded0 = trnscData(USDC, WMATIC, q[1], process.env.CONTRACT_ADDRESS)
    let encoded1 = trnscDataNoAmount(USDC, WMATIC, q[1], process.env.CONTRACT_ADDRESS)
    console.log("with", encoded0)
    console.log(encoded0.length)
    console.log("without", encoded1)
    console.log(encoded1.length)
}
//trnscTest()

module.exports = {
    quote,
    getReturns,
    trnscData, trnscDataNoAmount, getSwapAddr
}