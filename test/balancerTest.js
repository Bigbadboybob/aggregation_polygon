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
    ARBITRAGE_ADDRESS, ARBITRAGE_ABI,
    ERC20_ABI,
    ADDRESS_PROVIDER_ADDRESS, ADDRESS_PROVIDER_ABI,
    indices
} = require('../src/config')

const {quote, getPools, trnscData} = require("../src/balancer")
const { Web3Provider } = require("@balancer-labs/sor/node_modules/@ethersproject/providers")
const { updatePairAddresses } = require("../src/jetswap")

const account = process.env.CONTRACT_ADDRESS

const IERC20 = artifacts.require("IERC20")
const MyV2FlashLoan = artifacts.require("MyV2FlashLoan")

const addressProvider = '0xd05e3E715d945B59290df0ae8eF85c1BdB684744';
const lendingProvider = '0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf'

contract("MyV2FlashLoan", (accounts) => {
  const WHALE = BALANCER_ADDRESS
  const TOKEN = USDC
  const TOTOKEN = WMATIC
  const FUND_AMOUNT = pow(10, tokenDecimals[TOKEN]).mul(new BN(30000))

  let testFlashLoan
  let token
  beforeEach(async () => {
    token = await IERC20.at(TOKEN)
    toToken = await IERC20.at(TOTOKEN)
    //testFlashLoan = await MyV2FlashLoan.new(addressProvider)
    //console.log("contractAddress", testFlashLoan.address)

    await sendEther(web3, accounts[0], account, 5)

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
    let mBal = await web3.eth.getBalance(account)
    console.log("matic:", mBal)
  })

  it('flash loan', async () => {
    await getPools()
    let takerAmount = FUND_AMOUNT.div(web3.utils.toBN("100"))
    let [rate, data] = await quote(TOKEN, TOTOKEN, takerAmount)
    data = data
    console.log("data", data)
    //TODO: make transcData take data
    //TODO: add return amount to quickswap, apeswap and jetswap
    const callData = trnscData(TOKEN, TOTOKEN, data, account)
    console.log("callData:", callData)

    let bal0 = await token.balanceOf(account)
    let bal1 = await toToken.balanceOf(account)
    console.log('BEFORE')
    console.log('token0:', bal0.toString())
    console.log('token1:', bal1.toString())

    await token.approve(BALANCER_ADDRESS, takerAmount, {from: account})

    const tx = await web3.eth.sendTransaction(
      {
        from: account, to: BALANCER_ADDRESS,
        data: callData, gas: 300000
      }
    ).catch( async function (err, res) {
      console.log("error", err)
    })

    console.log(tx)

    bal0 = await token.balanceOf(account)
    bal1 = await toToken.balanceOf(account)
    console.log('AFTER')
    console.log('token0:', bal0.toString())
    console.log('token1:', bal1.toString())

  })
})