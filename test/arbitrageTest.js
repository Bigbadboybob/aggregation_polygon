const BN = require("bn.js")
const DN = require("decimal.js")
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
    DODO_ADDRESS,
    ARBITRAGE_ADDRESS, ARBITRAGE_ABI,
    ERC20_ABI,
    ADDRESS_PROVIDER_ADDRESS, ADDRESS_PROVIDER_ABI,
    indices,
    APESWAP_ADDRESS,
    JETSWAP_ADDRESS
} = require('../src/config')

const balancer = require("../src/balancer")
const quickSwap = require("../src/quickswap")
const apeSwap = require("../src/apeswap")
const jetSwap = require("../src/jetswap")
const dodo = require("../src/dodo")
const uniswap = require("../src/uniswap")
const aggregation = require("../src/aggregation")

const { Web3Provider } = require("@balancer-labs/sor/node_modules/@ethersproject/providers")

const account = process.env.address

const IERC20 = artifacts.require("IERC20")
const MyV2FlashLoan = artifacts.require("MyV2FlashLoan")

const addressProvider = '0xd05e3E715d945B59290df0ae8eF85c1BdB684744';
const lendingProvider = '0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf'

contract("MyV2FlashLoan", (conAddrs) => {
  const WHALE = BALANCER_ADDRESS
  const TOK0 = WMATIC
  const TOK1 = AAVE
  const TOK2 = DAI
  const TOK3 = USDC

  const FUND_AMOUNT0 = pow(10, tokenDecimals[TOK0]).mul(new BN(100))
  const FUND_AMOUNT1 = pow(10, tokenDecimals[TOK1]).mul(new BN(1))
  const FUND_AMOUNT2 = pow(10, tokenDecimals[TOK2]).mul(new BN(200))
  const FUND_AMOUNT3 = pow(10, tokenDecimals[TOK3]).mul(new BN(200))

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
    tok2 = await IERC20.at(TOK2)
    tok3 = await IERC20.at(TOK3)
    testFlashLoan = await MyV2FlashLoan.new(addressProvider)
    console.log("contractAddress", testFlashLoan.address)
    conAddr = testFlashLoan.address

    
    /*
    await tok0.transfer(conAddr, FUND_AMOUNT0, {
      from: WHALE,
    })
    bal = await tok0.balanceOf(conAddr)
    console.log("conAddr balance0:", bal.toString())

    await tok1.transfer(conAddr, FUND_AMOUNT1, {
      from: WHALE,
    })
    bal = await tok1.balanceOf(conAddr)
    console.log("conAddr balance1", bal.toString())

    await tok2.transfer(conAddr, FUND_AMOUNT2, {
      from: WHALE,
    })
    bal = await tok2.balanceOf(conAddr)
    console.log("conAddr balance2:", bal.toString())

    await tok3.transfer(conAddr, FUND_AMOUNT3, {
      from: WHALE,
    })
    bal = await tok3.balanceOf(conAddr)
    console.log("conAddr balance3:", bal.toString())
    */
    
  })

  it('flash loan', async () => {
    await aggregation.init()
    await balancer.getPools()
    let takerAmount0 = FUND_AMOUNT0.div(web3.utils.toBN("10"))
    await dodo.getReturns(takerAmount0.muln(prices[TOK0]).div(pow(10, tokenDecimals[TOK0])))
    await uniswap.getReturns(takerAmount0.muln(prices[TOK0]).div(pow(10, tokenDecimals[TOK0])))
    await apeSwap.getReturns(takerAmount0.muln(prices[TOK0]).div(pow(10, tokenDecimals[TOK0])))
    await jetSwap.getReturns(takerAmount0.muln(prices[TOK0]).div(pow(10, tokenDecimals[TOK0])))
    const swaps = []

    console.log("amount0", takerAmount0)
    let [rate0, data0] = await uniswap.quote(TOK0, TOK1, takerAmount0)
    console.log("rate0", rate0)
    console.log("data0", data0)
    const callData0 = uniswap.trnscData(TOK0, TOK1, data0, conAddr)
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
      takerAmount1 = takerAmount1.mul(takerAmount0).mul(pow(10, decimalDif)).div(new BN(1000000))
    } else {
      takerAmount1 = takerAmount1.mul(takerAmount0).div(pow(10, -decimalDif)).div(new BN(1000000))
    }
    console.log("taker1", takerAmount1.toString())
    let [rate1, data1] = await balancer.quote(TOK1, TOK2, takerAmount1)
    console.log("data1", data1)
    const callData1 = balancer.trnscDataNoAmount(TOK1, TOK2, data1, conAddr)
    const swap1 = {
      swapAddr: data1.swapAddr,
      approveAddr: data1.approveAddr,
      swapData: callData1,
      takerAddr: TOK1,
      takerAmount: DN(data1.total).minus(data1.amountsIn[0].times(DN(10).pow(tokenDecimals[TOK1]))).toString()
    }
    console.log("swap1:", swap1)
    swaps.push(swap1)

    let takerAmount2 = new BN(rate1*1000000)
    decimalDif = tokenDecimals[TOK2] - tokenDecimals[TOK1]
    if (decimalDif > 0) {
      takerAmount2 = takerAmount2.mul(takerAmount1).mul(pow(10, decimalDif)).div(new BN(1000000))
    } else {
      takerAmount2 = takerAmount2.mul(takerAmount1).div(pow(10, -decimalDif)).div(new BN(1000000))
    }
    console.log("taker2", takerAmount2.toString())
    let [rate2, data2] = await dodo.quote(TOK2, TOK3, takerAmount2)
    console.log("data2", data2)
    const callData2 = dodo.trnscDataNoAmount(TOK2, TOK3, data2, conAddr)
    const swap2 = {
      swapAddr: data2.swapAddr,
      approveAddr: data2.approveAddr,
      swapData: callData2,
      takerAddr: TOK2,
      takerAmount: "0"
    }
    console.log("swap2:", swap2)
    swaps.push(swap2)

    let takerAmount3 = new BN(rate2*1000000)
    decimalDif = tokenDecimals[TOK3] - tokenDecimals[TOK2]
    if (decimalDif > 0) {
      takerAmount3 = takerAmount3.mul(takerAmount2).mul(pow(10, decimalDif)).div(new BN(1000000))
    } else {
      takerAmount3 = takerAmount3.mul(takerAmount2).div(pow(10, -decimalDif)).div(new BN(1000000))
    }
    console.log("taker3", takerAmount3.toString())
    let [rate3, data3] = await apeSwap.quote(TOK3, TOK0, takerAmount3)
    console.log("data3", data3)
    const callData3 = apeSwap.trnscDataNoAmount(TOK3, TOK0, data3, conAddr)
    const swap3 = {
      swapAddr: data3.swapAddr,
      approveAddr: data3.approveAddr,
      swapData: callData3,
      takerAddr: TOK3,
      takerAmount: "0"
    }
    console.log("swap3:", swap3)
    swaps.push(swap3)

    let bal0 = await tok0.balanceOf(conAddr)
    let bal1 = await tok1.balanceOf(conAddr)
    let bal2 = await tok2.balanceOf(conAddr)
    let bal3 = await tok3.balanceOf(conAddr)
    console.log('BEFORE')
    console.log('token0:', bal0.toString())
    console.log('token1:', bal1.toString())
    console.log('token2:', bal2.toString())
    console.log('token3:', bal3.toString())

    console.log("swaps:", swaps)

    const tx = await testFlashLoan.myFlashLoanCall( swaps,
      {from: account, gas: 3000000}
    ).then( (err, res) => {
      console.log('Then')
      //console.log('ERROR:', err)
      console.log('RESULT:', res)
      console.log('logs')
      if (err != null) {
        for (const log of err.logs) {
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
    bal2 = await tok2.balanceOf(conAddr)
    bal3 = await tok3.balanceOf(conAddr)
    console.log('AFTER')
    console.log('token0:', bal0.toString())
    console.log('token1:', bal1.toString())
    console.log('token2:', bal2.toString())
    console.log('token3:', bal3.toString())

  })
})