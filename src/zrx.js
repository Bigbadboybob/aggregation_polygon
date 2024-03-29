const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
require('dotenv').config()
const Web3 = require('web3')
const web3 = new Web3(process.env.RPC_URL)
const DN = require('decimal.js')
let p = true

const coinDATA = require('./config')

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

const quoteABI = coinDATA.QUICKSWAP_ABI
const quoteAddress = coinDATA.QUICKSWAP_ADDRESS
const quoteContract = new web3.eth.Contract(quoteABI, quoteAddress)

var ORDERS = []

function getSwapAddr() {
    return coinDATA.QUICKSWAP_ADDRESS
}

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


async function getOrders() {
    o = await httpGetAsync("https://polygon.api.0x.org/orderbook/v1/orders?perPage=1000")
    ORDERS = JSON.parse(o).records
}

function tokenOrders(takerToken, makerToken) {
    return ORDERS.filter( (order) => {
        return (order.order.takerToken == takerToken.toLowerCase() && order.order.makerToken == makerToken.toLowerCase())
    })
}

async function test() {
    await getOrders()
    let orders = tokenOrders(USDC, WETH)
    console.log(orders)
}
test()

//Abandoned for now because of lack of liquidity
function quote(takerToken, makerToken, takerAmount) {
    //TODO: sort by rate and then fill orders until takerAmount reached
}

//TODO:
function trnscData(takerToken, makerToken, data, addr) {
    //console.log("data:", data)
    let deadline = Math.round(Date.now()/1000 + 60)
    let takerAmount = data.total
    let minOut = web3.utils.toBN(data.returnAmount).mul(web3.utils.toBN("975")).div(web3.utils.toBN("1000")).toString()
    return quoteContract.methods.swapExactTokensForTokens(takerAmount, minOut, [takerToken, makerToken], addr, String(deadline)).encodeABI()
}

/*
HEX: 626967626164626F79626F622072756C65732100{8 byte/16 hex unique id}E2DB17E2
HEX: 626967626164626F79626F622072756C657321000000007ACE4A302DE2DB17E2
HEX: 626967626164626F79626F622072756C657321000000000000031207E2DB17E2
*/
function trnscDataNoAmount(takerToken, makerToken, data, addr) {
    //console.log("data:", data)
    let deadline = Math.round(Date.now()/1000 + 120)
    let takerAmount = "44512891635166917309470866438905221514771660592425113995951798165235625039842"
    //let minOut = "44512891635166917309470866438905221514771660592425113993686431505999342540770"
    let minOut = "1";
    return quoteContract.methods.swapExactTokensForTokens(takerAmount, minOut, [takerToken, makerToken], addr, String(deadline)).encodeABI()
}

function switchProvider() {
    if (p) {
        web3.setProvider(process.env.SPARE_URL)
        p = false
    } else{
        web3.setProvider(process.env.RPC_URL)
        p = true
    }
}


async function main() {
    let rate = await quote(USDC, WBTC, web3.utils.toBN("3000").mul(web3.utils.toBN(String(10**tokenDecimals[USDC]))))
    console.log(rate)
}

async function trnscTest() {
    let q = await quote(USDC, WBTC, web3.utils.toBN("300").mul(web3.utils.toBN(String(10**tokenDecimals[USDC]))))
    let encoded0 = trnscData(USDC, WBTC, q[1], process.env.CONTRACT_ADDRESS)
    let encoded1 = trnscDataNoAmount(USDC, WBTC, q[1], process.env.CONTRACT_ADDRESS)
    console.log("with", encoded0)
    console.log(encoded0.length)
    console.log("without", encoded1)
    console.log(encoded1.length)
}
//trnscTest()

module.exports = {
    quote,
    switchProvider,
    trnscData, trnscDataNoAmount, getSwapAddr
}