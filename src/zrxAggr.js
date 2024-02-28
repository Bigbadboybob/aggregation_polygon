const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const Web3 = require('web3')
const web3 = new Web3(process.env.RPC_URL)


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

//https://polygon.api.0x.org/swap/v1/quote?sellToken=0x2791bca1f2de4661ed88a30c99a7a9449aa84174&sellAmount=1000000000&buyToken=0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee

function get0x(extension) {
    return httpGetAsync('https://polygon.api.0x.org' + extension)
}

function getSwap(takerToken, makerToken, amount) {
    return new Promise((resolve, reject) => {
        get0x('/swap/v1/quote?sellToken=' + takerToken
        + '&buyToken=' + makerToken
        + '&sellAmount=' + amount.toString()
        + '&slippagePercentage=1'
        ).then( text => {
            quote = JSON.parse(text)
            resolve(quote)
        }).catch( err => {
            reject(err)
        })
    })
}
getSwap(WMATIC, USDC, web3.utils.toWei('10', 'ether')).then(quote => console.log(quote))


module.exports = {
    getSwap
}