const BN = require("bn.js")
const { sendEther, pow } = require("./util")
const {
    DAI, WETH, USDC, USDT, WBTC, AAVE, WMATIC,
    prices,
    names,
    tokenDecimals,
    zeroAddress,
    QUICKSWAP_ADDRESS, QUICKSWAP_ABI,
    QUICKSWAP_SWAP_ABI,
    INCH_ROUTER_ADDRESS,
    BALANCER_ADDRESS, BALANCER_ABI,
    UNISWAP_ADDRESS, UNISWAP_ABI,
    ARBITRAGE_ADDRESS, ARBITRAGE_ABI,
    ERC20_ABI,
    ADDRESS_PROVIDER_ADDRESS, ADDRESS_PROVIDER_ABI,
    indices,
    APESWAP_ADDRESS,
    JETSWAP_ADDRESS
} = require('../src/config')

const aggregation = require("../src/aggregation")
const balancer = require("../src/balancer")
const quickSwap = require("../src/quickswap")
const apeSwap = require("../src/apeswap")
const jetSwap = require("../src/jetswap")
const uniswap = require("../src/uniswap")
const dodo = require("../src/dodo")

const { Web3Provider } = require("@balancer-labs/sor/node_modules/@ethersproject/providers")

const account = process.env.address

const IERC20 = artifacts.require("IERC20")
const MyV2FlashLoan = artifacts.require("MyV2FlashLoan")

const addressProvider = '0xd05e3E715d945B59290df0ae8eF85c1BdB684744';
const lendingProvider = '0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf'

contract("MyV2FlashLoan", (conAddrs) => {
  const WHALE = BALANCER_ADDRESS
  const TOK0 = USDC
  const TOK1 = DAI

  const FUND_AMOUNT0 = pow(10, tokenDecimals[TOK0]).mul(new BN(10000))
  const FUND_AMOUNT1 = pow(10, tokenDecimals[TOK1]).mul(new BN(10000))

  let testFlashLoan
  let tok0
  let tok1
  let tok2
  let tok3
  var conAddr
  beforeEach(async () => {
    let bal
    tok0 = await IERC20.at(TOK0)
    tok1 = await IERC20.at(TOK1)
    testFlashLoan = await MyV2FlashLoan.new(addressProvider)
    console.log("contractAddress", testFlashLoan.address)
    conAddr = testFlashLoan.address

    await tok0.transfer(conAddr, FUND_AMOUNT0, {
      from: WHALE,
    })
    bal = await tok0.balanceOf(conAddr)
    console.log("conAddr balance0:", bal.toString())

    /*
    await tok1.transfer(conAddr, FUND_AMOUNT1, {
      from: WHALE,
    })
    bal = await tok1.balanceOf(conAddr)
    console.log("conAddr balance1", bal.toString())
    */
  })

  it('flash loan', async () => {
    await aggregation.init()
    await balancer.getPools()
    let takerAmount0 = FUND_AMOUNT0.div(web3.utils.toBN("10"))
    await dodo.getReturns(takerAmount0.muln(prices[TOK0]).div(pow(10, tokenDecimals[TOK0])))
    const swaps = []

    console.log("amount0", takerAmount0.toString())
    let [rate0, data0] = await balancer.quote(TOK0, TOK1, takerAmount0)
    console.log("rate0", rate0)
    console.log("data0", data0)
    const callData0 = balancer.trnscData(TOK0, TOK1, data0, conAddr)
    const swap0 = {
      swapAddr: data0.swapAddr,
      approveAddr: data0.approveAddr,
      swapData: callData0,
      takerAddr: TOK0,
      takerAmount: takerAmount0.toString()
    }
    console.log("swap0:", swap0)
    swaps.push(swap0)

    let decimalDif
    let takerAmount1 = new BN(rate0*1000000)
    decimalDif = tokenDecimals[TOK1] - tokenDecimals[TOK0]
    if (decimalDif > 0) {
      takerAmount1 = takerAmount1.mul(takerAmount0).mul(pow(10, decimalDif)).div(new BN(1100000))
    } else {
      takerAmount1 = takerAmount1.mul(takerAmount0).div(pow(10, -decimalDif)).div(new BN(1100000))
    }
    console.log("taker1", takerAmount1.toString())
    let [rate1, data1] = await dodo.quote(TOK1, TOK0, takerAmount1)
    console.log("data1", data1)
    const callData1 = dodo.trnscDataNoAmount(TOK1, TOK0, data1, conAddr)
    const swap1 = {
      swapAddr: data1.swapAddr,
      approveAddr: data1.approveAddr,
      swapData: callData1,
      takerAddr: TOK1,
      takerAmount: "0"
    }
    console.log("swap1:", swap1)
    swaps.push(swap1)

    let bal0 = await tok0.balanceOf(conAddr)
    let bal1 = await tok1.balanceOf(conAddr)
    console.log('BEFORE')
    console.log('token0:', bal0.toString())
    console.log('token1:', bal1.toString())

    console.log("swaps:", swaps)

    const tx = await testFlashLoan.myFlashLoanCall( swaps,
      {from: account, gas: 1200000}
    ).then( (res, err) => {
      console.log('Then')
      //console.log('ERROR:', err)
      console.log('RESULT:', res)
      console.log('logs')
      if (res != null) {
        for (const log of res.logs) {
          //console.log(log)
          if(log.args.val != null) {
            if (BN.isBN(log.args.val)) {
              console.log(log.args.message, log.args.val.toString())
            } else {
              console.log(log.args.message, log.args.val)
            }
          }
        }
      }
    })
    console.log(tx)

    /*
    for (const log of tx.logs) {
      if (BN.isBN(args[1])) {
        console.log(log.args[0] + ": " + log.args[1].toString())
      } else {
        console.log(log.args[0] + ": " + log.args[1])
      }
    }
    */

    bal0 = await tok0.balanceOf(conAddr)
    bal1 = await tok1.balanceOf(conAddr)
    console.log('AFTER')
    console.log('token0:', bal0.toString())
    console.log('token1:', bal1.toString())

  })
})