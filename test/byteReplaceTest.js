const BN = require("bn.js")
const { sendEther, pow } = require("./util")
const {DAI, WETH, USDC, USDT, WBTC, AAVE, WMATIC,} = require('../src/config')

const {quote, trnscData, trnscDataNoAmount} = require("../src/quickswap")
const { Web3Provider } = require("@balancer-labs/sor/node_modules/@ethersproject/providers")

const account = process.env.address

const IERC20 = artifacts.require("IERC20")
const MyV2FlashLoan = artifacts.require("MyV2FlashLoan")

const addressProvider = '0xd05e3E715d945B59290df0ae8eF85c1BdB684744';
const lendingProvider = '0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf'

contract("MyV2FlashLoan", (accounts) => {
  const TOKEN = WETH
  const TOTOKEN = USDC
  const DECIMALS = 18

  let testFlashLoan
  beforeEach(async () => {
    testFlashLoan = await MyV2FlashLoan.new(addressProvider)
    console.log("contractAddress", testFlashLoan.address)
    conAddr = testFlashLoan.address
  })

  it('flash loan', async () => {
    let q = await quote(TOKEN, TOTOKEN, web3.utils.toBN("100000000000000000"))
    let data = trnscData(TOKEN, TOTOKEN, q[1], conAddr)
    let tx = await testFlashLoan.testReplaceBytes(data,
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
  })
})

/* Test using this solidity function:

    function testReplaceBytes(bytes memory b) external {
        bytes memory before = b;
        bytes32 repl = 0x626967626164626f79626f62000000746573742062797465207265706c616365;
        bytes8 id = 0x0000007ace4a302d;
        emit Log("before:", before);
        b = replaceBytes(b, id, repl);
        emit Log("after:", b);
    }
*/