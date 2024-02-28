const BN = require("bn.js")
const DN = require('decimal.js')
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
    ARBITRAGE_ADDRESS, ARBITRAGE_ABI,
    ERC20_ABI,
    ADDRESS_PROVIDER_ADDRESS, ADDRESS_PROVIDER_ABI,
    indices
} = require('../src/config')

const {quote, getPools, getTokensPools, balancerTrnscData, outGivenIn} = require("../src/balancer")
const { Web3Provider } = require("@balancer-labs/sor/node_modules/@ethersproject/providers")

const account = process.env.address

const IERC20 = artifacts.require("IERC20")
const MyV2FlashLoan = artifacts.require("MyV2FlashLoan")

const addressProvider = '0xd05e3E715d945B59290df0ae8eF85c1BdB684744';
const lendingProvider = '0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf'

contract("MyV2FlashLoan", (accounts) => {
  const WHALE = BALANCER_ADDRESS
  const TOKEN = WETH
  const TOTOKEN = USDC
  const DECIMALS = 18
  const FUND_AMOUNT = pow(10, DECIMALS).mul(new BN(10))
  const BORROW_AMOUNT = pow(10, DECIMALS).mul(new BN(100))

  let testFlashLoan
  let token
  beforeEach(async () => {
    token = await IERC20.at(TOKEN)
    toToken = await IERC20.at(TOTOKEN)
    //testFlashLoan = await MyV2FlashLoan.new(addressProvider)
    //console.log("contractAddress", testFlashLoan.address)

    //await sendEther(web3, accounts[0], WHALE, 1)

    // send enough token to cover fee
    const bal = await token.balanceOf(WHALE)
    console.log('balance:', bal.toString())
    if (bal.gte(FUND_AMOUNT)) {
      console.log('Funding')
      await token.transfer(account, FUND_AMOUNT, {
        from: WHALE,
      })
      const bal = await token.balanceOf(account)
      console.log("account balance:", bal.toString())
    }
  })

  it('flash loan', async () => {
    await getPools()
    let pools = getTokensPools(TOKEN, TOTOKEN)
    let swapAmount = DN("1")
    let expRet = outGivenIn(TOKEN, TOTOKEN, swapAmount, pools[0])
    console.log("expRet:", expRet)
    expRet = expRet.times(0.9).round()

    const callData = singleSwapData(TOKEN, TOTOKEN, swapAmount, pools[0], expRet)

    /*
    let takerAmount = FUND_AMOUNT.div(web3.utils.toBN("10"))
    let [rate, data] = await quote(TOKEN, TOTOKEN, takerAmount)
    data = await data
    console.log("data", data)
    */
    //const callData = balancerTrnscData(TOKEN, TOTOKEN, data.amountsIn, data.path, data.returnAmount, data.pathReturns)
    console.log("callData:", callData)

    let bal0 = await token.balanceOf(account)
    let bal1 = await toToken.balanceOf(account)
    console.log('BEFORE')
    console.log('token0:', bal0.toString())
    console.log('token1:', bal1.toString())

    let takerAmount = new BN(swapAmount.times(DN("10").pow(tokenDecimals[TOKEN])).toString())
    //let takerAmount = swapAmount.times(DN("10").pow(tokenDecimals[takerToken]))).toString(),
    await token.approve(BALANCER_ADDRESS, takerAmount, {from: account})

    const tx = await web3.eth.sendTransaction(
      {
        from: account, to: BALANCER_ADDRESS,
        data: callData, gas: 1000000
      }
    )

    /*
    for (const log of tx.logs) {
      console.log(log.args.message, log.args.val.toString())
    }
    */
    console.log(tx)

    bal0 = await token.balanceOf(account)
    bal1 = await toToken.balanceOf(account)
    console.log('AFTER')
    console.log('token0:', bal0.toString())
    console.log('token1:', bal1.toString())

  })
})




function singleSwapData(takerToken, makerToken, swapAmount, pool, expRet) {
  var fundSettings = {
      //"sender":               ARBITRAGE_ADDRESS,
      //"recipient":            ARBITRAGE_ADDRESS,
      "sender":               process.env.address,
      "recipient":            process.env.address,
      "fromInternalBalance":  false,
      "toInternalBalance":    false
  };

  var deadline = web3.utils.toBN(String(Math.round(Date.now()/1000 + 60)));

  const takerData = {
    "symbol": names[takerToken],
    "decimals": tokenDecimals[takerToken],
    "limit": swapAmount
  }

  const makerData = {
    "symbol": names[makerToken],
    "decimals": tokenDecimals[makerToken],
    "limit": expRet.times(0.95)
  }

  const tokenData = {}
    tokenData[takerToken] = takerData
    tokenData[makerToken] = makerData

  const swap = {
    "poolId": pool.id,
    "assetIn": takerToken,
    "assetOut": makerToken,
    "amount": swapAmount
  }
  const swapKind = 0

  const swapStruct = {
    poolId: swap["poolId"],
    kind: swapKind,
    assetIn: web3.utils.toChecksumAddress(swap["assetIn"]),
    assetOut: web3.utils.toChecksumAddress(swap["assetOut"]),
    amount: swap.amount.times(DN("10").pow(tokenDecimals[takerToken])).toString(),
    userData: '0x'
  };

  const fundStruct = {
    sender: web3.utils.toChecksumAddress(fundSettings["sender"]),
    fromInternalBalance: fundSettings["fromInternalBalance"],
    recipient: web3.utils.toChecksumAddress(fundSettings["recipient"]),
    toInternalBalance: fundSettings["toInternalBalance"]
  };


  const tokenLimit = tokenData[makerToken].limit.times(DN("10").pow(tokenDecimals[makerToken]).round()).toString()

  console.log("pool:", pool)
  console.log("pool:", pool.tokensList)
  console.log("encoding")
  console.log("swapStruct: ", swapStruct)
  console.log("fundStruct: ", fundStruct)
  console.log("tokenLimit: ", tokenLimit)
  console.log("deadline: ", deadline.toString())

  const balancerContract = new web3.eth.Contract(BALANCER_ABI, BALANCER_ADDRESS)

  const funcData = balancerContract.methods.swap(
    swapStruct,
    fundStruct,
    tokenLimit,
    deadline.toString()
  ).encodeABI()

  return funcData
}
