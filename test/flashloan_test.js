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

const IERC20 = artifacts.require("IERC20")
const MyV2FlashLoan = artifacts.require("MyV2FlashLoan")

const addressProvider = '0xd05e3E715d945B59290df0ae8eF85c1BdB684744';
const lendingProvider = '0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf'

contract("MyV2FlashLoan", (accounts) => {
  const WHALE = BALANCER_ADDRESS
  const TOKEN = USDT
  const TOTOKEN = USDC
  const DECIMALS = 18
  const FUND_AMOUNT = pow(10, DECIMALS).mul(new BN(10))
  const BORROW_AMOUNT = pow(10, DECIMALS).mul(new BN(100))

  let testFlashLoan
  let token, toToken
  beforeEach(async () => {
    token = await IERC20.at(TOKEN)
    toToken = await IERC20.at(TOTOKEN)
    testFlashLoan = await MyV2FlashLoan.new(addressProvider)
    console.log("contractAddress", testFlashLoan.address)

    //await sendEther(web3, accounts[0], WHALE, 1)

    // send enough token to cover fee
    const bal = await token.balanceOf(WHALE)
    console.log('balance:', bal.toString())
    if (bal.gte(FUND_AMOUNT)) {
      console.log('Funding')
      await token.transfer(testFlashLoan.address, FUND_AMOUNT, {
        from: WHALE,
      })
      const contractBal = await token.balanceOf(testFlashLoan.address)
      console.log(contractBal.toString())
    }
  })

  it('flash loan', async () => {
    const tx = await testFlashLoan.myFlashLoanCall([{
      swapAddr: accounts[0],
      approveAddr: accounts[0],
      swapData: "0x",
      takerAddr: TOKEN,
      takerAmount: "10000000000"
    }], {
      from: accounts[0]
    }).catch(err => {
      console.log(err)
    })

    for (const log of tx.logs) {
      console.log(log.args.message, log.args.val.toString())
    }
  })
})