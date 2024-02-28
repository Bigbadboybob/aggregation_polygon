"use strict"
const _ = require('lodash')
const {SOR} =  require('@balancer-labs/sor')
const { ApolloClient, InMemoryCache, gql} = require('@apollo/client')
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
require('dotenv').config()
const Web3 = require('web3')
const web3 = new Web3(process.env.RPC_URL)
const BN = require('bignumber.js');
const DN = require('decimal.js')
DN.set({toExpPos: 100, toExpNeg: -100})

const { Resolver } = require('@balancer-labs/sor/node_modules/@ethersproject/providers');
const { makeUniqueId, stringifyForDisplay } = require('@apollo/client/utilities');

const {
    coins,
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
} = require('./config')

function getSwapAddr() {
  return BALANCER_ADDRESS
}

const poolsSource = 'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-polygon-v2'

const balancerContract = new web3.eth.Contract(BALANCER_ABI, BALANCER_ADDRESS)

const client = new ApolloClient({
  uri: poolsSource,
  cache: new InMemoryCache(),
  shouldBatch: true,
});

const QUERY =` 
query {
  pools(
    orderBy: totalLiquidity
    orderDirection: desc
    where: {
      totalLiquidity_gt: 0
      swapEnabled: true
    }
  ) {
    id
    address
    poolType
    amp
    factory
    tokensList
    swapFee
    swapEnabled
    tokens {
      symbol
      address
      weight
      balance
    }
  }
}
`
var POOLS

function getQuery(takerToken, makerToken) {
  var query =` 
  query ${names[takerToken]}${names[makerToken]} {
    pools(
      first: 15
      orderBy: totalLiquidity
      orderDirection: desc
      where: {
        tokensList_contains: ["${takerToken}", "${makerToken}"]
        totalLiquidity_gt: 0
        swapEnabled: true
      }
    ) {
      id
      address
      poolType
      amp
      factory
      swapFee
      tokens {
        symbol
        address
        weight
        balance
      }
    }
  }
  `
  return query
}

function getPools() {
  return new Promise( (resolve, reject) => {
    client.query({
      query: gql(QUERY)
    })
    .then(data => {
      //console.log("Subgraph data")
      POOLS = _.cloneDeep(data.data.pools)
      updatedBalances().then( res => {
        resolve(res)
      })
    })
    .catch(err => {
      console.log("Error fetching data: ", err)
      reject(err)
    })
  })
}

//returns a promise.all() promise which when resolved updates all of the pools balances
function updatedBalances() {
  var balProms = []
  for (const pool of POOLS) {
    let balProm = new Promise((resolve, reject) => {
      balancerContract.methods.getPoolTokens(pool.id).call().then( res => {
        let toks = res.tokens
        let bals = res.balances
        for (let t = 0; t < pool.tokens.length; t++) {
          if (coins.includes(toks[t])) {
            pool.tokens[t].balance = DN(bals[t]).div(DN("10").pow(tokenDecimals[toks[t]])).toString()
          }
        }
        resolve()
      })//.catch( err => {
        /*
        console.log("balacer error: pool balances")
        console.log(err)
        resolve()
      }
      )
      */
    })
    balProms.push(balProm)
  }
  return Promise.all(balProms)
}
//

//meant to be called after getPools is called
function getTokensPools(takerToken, makerToken) {
  let pools = []
  for (let p = 0; p < POOLS.length; p++) {
    let tokens = POOLS[p].tokensList
    web3.setProvider(ganache.provider({
        "fork": 'https://speedy-nodes-nyc.moralis.io/676a6c6eac64d9f866c4daca/eth/mainnet',
        "locked": false,
        "mnemonic": mnemonic,
        "unlocked_accounts": ['0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE', '0xF977814e90dA44bFA03b6295A0616a897441aceC',
        '0x66c57bF505A85A74609D2C83E94Aabb26d691E1F', '0x2E076fB19B3Ee8F55480E0654eD573DadF8cb16d'],
    }))
    if (tokens.includes(takerToken.toLowerCase())
    && tokens.includes(makerToken.toLowerCase())) {
      pools.push(POOLS[p])
    }
  }
  return pools
}


function getBestPathIds(takerToken, makerToken, swapAmounts, pools) {
    swapAmounts.sort( (a, b) => b - a)
    var paths = Array(swapAmounts.length).fill({troll: "doop"})
    var pathReturns = Array(swapAmounts.length).fill(DN(0))
    var totalOut = DN('0')
    var pools = [...pools]
    for (let a = 0; a < swapAmounts.length; a++) {
        //TODO: sus that this case actually happened
        //console.log('path', a)
        let bestOut = DN('-1')
        let zero = false
        let bestPoolIndex = 0
        if (swapAmounts[a] == DN('0')) {
          swapAmounts[a] = DN('0.1') //just to get an actual pool
          zero = true
        }
        for (let p = 0; p < pools.length; p++) {
            let pool = pools[p]
            //console.log(names[makerToken]+names[makerToken])
            //console.log(pool.tokens)
            let out = outGivenIn(takerToken, makerToken, swapAmounts[a], pool)
            //console.log('outGivenIn', out)
            if (out.gt(bestOut)) {
                paths[a] = pool
                bestPoolIndex = p
                bestOut = out
            }
        }
        if (!zero) {
          pathReturns[a] = bestOut
          totalOut = bestOut.plus(totalOut)
        } else {
          paths[a] = {troll: "no"}
          pathReturns = DN(0);
        }
        pools.splice(bestPoolIndex, 1)
    }
    return [paths, pathReturns, totalOut]
}

function outGivenIn(takerToken, makerToken, swapAmount, pool) {
  let poolTokens = pool.tokens
  let fee = pool.swapFee
  //=swapAmount so that formula returns 0 if taker or maker not found (shouldn't happen)
  let takerBalance = swapAmount
  let takerWeight = DN('1')
  let makerBalance = DN('1')
  let makerWeight = DN('1')
  for (let t = 0; t < poolTokens.length; t++) {
    let token = poolTokens[t]
    if (token.address == takerToken.toLowerCase()) {
      takerBalance = DN(token.balance)
      takerWeight = DN(token.weight)
    } else if (token.address == makerToken.toLowerCase()) {
      makerBalance = DN(token.balance)
      makerWeight = DN(token.weight)
    }
  }
  //TODO: fix fees, figure out why the rates aren't correct
  return makerBalance.times(DN(1).minus((takerBalance.div(takerBalance.plus(swapAmount))).pow(takerWeight.div(makerWeight)))).times(DN(1).minus(fee))
}

//outGivenInS and calcInv use newton's method
function outGivenInS(takerToken, makerToken, swapAmount, pool) {
  const bals = []
  var takerIndex = -1
  var makerIndex = -1
  for (let t = 0; t < pool.tokens.length; t++) {
    let tok = pool.tokens[t]
    bals.push(DN(tok.balance))
    if (tok.address == takerToken.toLowerCase()) {
      takerIndex = t
    }
    if (tok.address == makerToken.toLowerCase()) {
      makerIndex = t
    }
  }

  if (takerIndex < makerIndex) {
    makerIndex--
  }

  const n = DN(bals.length)
  const nn = n.pow(n)

  const inv = calcInvS(bals, pool.amp)
  if (inv.isNaN()) {
    return DN(0)
  }
  
  const sum = bals.reduce( (prev, curr) => prev.plus(curr))
  if (takerIndex == -1) {
    var takerBal = swapAmount
  } else {
    var takerBal = DN(bals.splice(takerIndex, 1)[0])
  }
  if (makerIndex == -1) {
    var makerBal = DN(1)
  } else {
    var makerBal = DN(bals.splice(makerIndex, 1)[0])
  }

  let fee = pool.swapFee
  //=swapAmount so that formula returns 0 if taker or maker not found (shouldn't happen)

  var prod = DN(1)
  if (bals.length > 0) {
    prod = bals.reduce( (prev, curr) => prev.times(curr))
  }
  const amp = DN(pool.amp)
  const coef0 = inv.pow(n.plus(1))
  const coef1 = nn.times(prod).times(takerBal.plus(swapAmount))
  const coef2 =  amp.times(nn)
  const coef3 = sum.plus(swapAmount)
  const coef4 = inv.times(coef2.minus(1))
  var out = swapAmount
  var prevOut = DN(0)
  for (let i = 0; i < 256; i++) {
    prevOut = out
    let num = coef0.div(coef1.times(makerBal.minus(out))).minus(coef2.times(coef3.minus(out))).plus(coef4)
    let denom = coef2.minus(coef0.div(coef1.times(makerBal.minus(out).pow(2))))
    out = out.minus(num.div(denom))
    let err = out.minus(prevOut)
    if (err.abs().lte(DN(0.1).pow(18))) {
      break
    }
  }

  //TODO: fee
  return out.times(DN(1).minus(fee))
}

function calcInvS(bals, amp) {
  bals[0] = DN(bals[0])
  amp = DN(amp)
  const sum = bals.reduce( (prev, curr) => prev.plus(curr))
  const prod = bals.reduce( (prev, curr) => prev.times(curr))
  const n = DN(bals.length)
  const nn = n.pow(n)
  var inv = sum
  let prevInv = DN(0)
  const iCoef0 = nn.times(prod)
  const coef1 = amp.times(nn).minus(1)
  const coef2 = amp.times(nn).times(sum)
  for (let i = 0; i < 256; i++) {
    prevInv = inv
    let num = inv.pow(n.plus(1)).div(iCoef0).plus(coef1.times(inv)).minus(coef2)
    let denom = inv.pow(n).times(n+1).div(iCoef0).plus(coef1)
    inv = inv.minus(num.div(denom))
    let err = inv.minus(prevInv)
    if (err.abs().lte(DN(0.1).pow(18))) {
      break
    }
  }

  return inv
}

//single amount iterate should just be same amount
//NAN issue
function iterateSwapAmountsApproximation(swapAmounts, path, takerToken, makerToken, outRange){
  //calculate spotprices (sp) and sp'
  var sps = Array(swapAmounts.length)
  var dsps = Array(swapAmounts.length)
  var newAmounts = Array(swapAmounts.length)
  //for tsp calculation
  let num = DN('0')
  let denom = DN('0')
  //This isn't used until redistributeAmounts() but calculate in this loop for efficiency
  var bals = Array(swapAmounts.length).fill(DN("0"))
  for (let a = 0; a < swapAmounts.length; a++) {
    let ain = swapAmounts[a]
    let aout = outGivenIn(takerToken, makerToken, swapAmounts[a], path[a])
    let pool = path[a]
    let poolTokens = pool.tokens
    let bin = swapAmounts[a].abs()
    let win = DN('1')
    let bout = DN('1')
    let wout = DN('1')
    for (let t = 0; t < poolTokens.length; t++) {
      let token = poolTokens[t]
      if (token.address == takerToken.toLowerCase()) {
          bin = DN(token.balance)
          if (bin.lt(DN("0"))) {
            bin = DN("0")
            //console.log("NEGATIVE")
            //console.log(bin)
            //console.log(pool)
          }
          bals[a] = bin
          win = DN(token.weight)
      } else if (token.address == makerToken.toLowerCase()) {
          bout = DN(token.balance)
          wout = DN(token.weight)
      }
    }
    if (outRange.has(a)) {
      continue
    }
    sps[a] = wout.div(win).times(bin.plus(ain).div(bout.minus(aout)))
    dsps[a] = wout.div(win).times(DN("1").div(bout.times(bin.pow(win.div(wout))))).times(DN("1").plus(win.div(wout))).times(bin.plus(ain).pow(win.div(wout)))
    
    //console.log("AIN"+String(a), ain)
    //console.log("SPOT PRICE"+String(a), sps[a])
    //console.log("pool", a)
    //console.log([wout, win, ain, aout, bin, bout])
    //console.log("DERIVATIVE SPOT PRICE"+String(a), dsps[a])
    
    num = num.plus(sps[a].div(dsps[a]))
    denom = denom.plus(DN('1').div(dsps[a]))
  }
  let tsp = num.div(denom)
  //console.log("SP", sps[0])
  //console.log("TSP", tsp)
  //console.log("num", num)
  //console.log("denom", denom)

  for (let a = 0; a < swapAmounts.length; a++) {
    if (outRange.has(a)) {
      newAmounts[a] = swapAmounts[a]
      continue
    }
    //console.log(a)
    newAmounts[a] = (tsp.minus(sps[a]).div(dsps[a])).plus(swapAmounts[a])
    //console.log("amount" + String(a) + " " + String(newAmounts[a]))
  }
  //console.log(newAmounts)
  //console.log("bals", bals)
  outRange = redistributeInputAmounts(newAmounts, bals)  //interestingly, this modifies newAmounts. Javascript uses call-by-sharing.
  //This means for arrays and objects it passes a copy in which all parameters are referenced to the object passed into the function. 
  //why do we construct outrange before instead of just returning it from redistributeInputAmounts
  //console.log(newAmounts)
  return [newAmounts, tsp, outRange]
}

function redistributeInputAmounts(swapAmounts, bals) {
  var atLimit = new Set()
  var atZero = new Set()
  var limits = Array(swapAmounts.length) 
  var redistributed = true
  let loop = 0
  for (let a = 0; a < swapAmounts.length; a++) {
    limits[a] = bals[a].div(DN('2'))
  }
  while (redistributed) {
    loop += 1
    //prevent from running forever
    if (loop >= 1000) {
      return swapAmounts
    }
    redistributed = false
    //console.log("redistributing")
    for (let a = 0; a < swapAmounts.length; a++) {
      let amount = swapAmounts[a]
      //console.log("amount", amount)
      //make sure outRange is accurate
      if (amount.eq(limits[a])) {
        atLimit.add(a)
        //console.log("limit")
        //console.log("limit", limits[a])
      //actually redistribute
      } else if (amount.gt(limits[a])) {
        //console.log('above limit')
        redistributed = true
        let excess = amount.minus(limits[a])
        swapAmounts[a] = limits[a]
        atLimit.add(a)
        
        let distributed = swapAmounts.length-atLimit.size
        //distribute
        for (let d = 0; d < swapAmounts.length; d++) {
          if (!atLimit.has(d)) {
            swapAmounts[d] = swapAmounts[d].plus(excess.div(distributed))
            if (atZero.has(d)) {
              atZero.delete(d)
            }
          }
        }
      //make sure outRange is accurate
      } else if (amount.eq(DN('0'))) {
        //console.log('zero')
        atZero.add(a)
      //actually redistribute
      } else if (amount.lt(DN('0'))) {
        //console.log('negative')
        redistributed = true
        let discrep = amount.neg()
        swapAmounts[a] = DN('0')
        atZero.add(a)
        let distributed = swapAmounts.length-atZero.size
        //distribute
        for (let d = 0; d < swapAmounts.length; d++) {
          if (!atZero.has(d)) {
            swapAmounts[d] = swapAmounts[d].minus(discrep.div(distributed))
            if (atLimit.has(d)) {
              atLimit.delete(d)
            }
          }
        }
      }
    }
  }
  let outRange = union(atZero, atLimit)
  return outRange
}

function union(setA, setB) {
    let _union = new Set(setA)
    for (let elem of setB) {
        _union.add(elem)
    }
    return _union
}

//https://docs.balancer.fi/developers/smart-order-router
function quoteWeighted(takerToken, makerToken, takerAmount, pools) {
  //console.log(names[takerToken]+names[makerToken])
  let b = 0
  let swapAmounts = []
  let bestSwapAmounts = []
  let bestSwapAmountsOuter = []
  let path = []
  let pathReturns = []
  let bestPathOuter = []
  let bestPathReturnsOuter = []
  let bestReturnAmount = DN('-1')
  let returnAmount = DN('0')
  let bestPath = [{id:'poop'}] 
  let bestPathReturns = []
  let count = 0
  endLoop:
  while(returnAmount.gt(bestReturnAmount)) {
    //console.log('rate', returnAmount.div(takerAmount))
    //console.log(path)
    //console.log(names[takerToken]+names[makerToken])
    bestReturnAmount = returnAmount
    bestSwapAmountsOuter = [...swapAmounts]
    bestPathOuter = [...path]
    bestPathReturnsOuter = [...pathReturns]
    if (b < pools.length) {
      b++
      let scale = DN(DN('1').sub(DN('1').div(DN(String(b)))))
      for(let a = 0; a < swapAmounts.length; a++) {
        swapAmounts[a] = swapAmounts[a].mul(scale)
      }
      swapAmounts.push(takerAmount.mul(DN('1').div(DN(String(b)))))
    }
    //2.1 1-1/b
    bestPath = [{id:'poop'}] //for comparison
    bestPathReturns = []
    let getBestOutput = getBestPathIds(takerToken, makerToken, swapAmounts, pools)
    path = getBestOutput[0]
    pathReturns = getBestOutput[1]
    //2.2
    let outRange = new Set()
    while(!pathEquals(path, bestPath)) {
      bestPath = [...path]
      bestSwapAmounts = [...swapAmounts]
      bestPathReturns = [...pathReturns]
      //2.3 find best swapAmounts for this bestPath
      //iterates until all errors for target spot price vs spot price after trade are within 0.001
      let iter = true
      while(iter) {
        count++
        if (count > 3000) {
          continue endLoop
        }
        iter = false
        //console.log(names[takerToken]+names[makerToken])
        //console.log('swapAmounts', swapAmounts)
        //console.log('count', count)
        let newAmounts
        let tsp
        [newAmounts, tsp, outRange] = iterateSwapAmountsApproximation(swapAmounts, bestPath, takerToken, makerToken, outRange)
        //console.log("newAmounts", newAmounts)
        swapAmounts = newAmounts
        //error calculation:
        let avgSP = DN('0')
        let sps = Array(swapAmounts.length)
        for (let a = 0; a < swapAmounts.length; a++) {
          if (outRange.has(a)) {
            continue
          }
          //maybe make this a function?
          //This could be optimized much better
          let bin = swapAmounts[a]
          let win = DN('1')
          let bout = DN('1')
          let wout = DN('1')
          let poolTokens = path[a].tokens
          for (let t = 0; t < poolTokens.length; t++) {
            let token = poolTokens[t]
            if (token.address == takerToken.toLowerCase()) {
                bin = DN(token.balance)
                win = DN(token.weight)
            } else if (token.address == makerToken.toLowerCase()) {
                bout = DN(token.balance)
                wout = DN(token.weight)
            }
          }
          let ain = swapAmounts[a]
          let aout = outGivenIn(takerToken, makerToken, ain, path[a])
          //console.log("pool", a)
          //console.log([wout, win, ain, aout, bin, bout])
          let newSP = wout.div(win).times(bin.plus(ain).div(bout.minus(aout)))
          //console.log(newSP)
          //console.log(path[a])
          sps[a] = newSP
          avgSP = avgSP.plus(newSP)
        }
        //console.log("sps", sps)
        //console.log("amounts", swapAmounts)
        avgSP = avgSP.div(DN(String(swapAmounts.length-outRange.size)))
        //console.log("AVGSP", avgSP)
        //TODO: not calculating outRange properly. fixed?
        //console.log(outRange)
        for (let a = 0; a < swapAmounts.length; a++) {
          if (outRange.has(a)) {
            continue
          }
          let error = avgSP.minus(sps[a]).div(avgSP)
          //console.log(names[takerToken]+names[makerToken])
          //console.log("ERROR"+String(a), error)
          if (error.abs().gt(DN('0.002'))) {
            iter = true
          }
        }
        //console.log('swapAmounts', swapAmounts)
        //console.log(iter)
      }
      [path, pathReturns, returnAmount] = getBestPathIds(takerToken, makerToken, swapAmounts, pools) 
      //console.log('rate', returnAmount.div(makerAmount))
      //console.log('bestRate', bestReturnAmount.div(makerAmount))
      //console.log(swapAmounts)
      //console.log(path)
      //console.log(bestPath)
    }
    //let result = [bestReturnAmount, bestSwapAmountsOuter, bestPathOuter, bestPathOuter]
    //[bestReturnAmount, bestSwapAmountsOuter, bestPathOuter, bestPathOuter] = cleanQData(result, takerAmount, tokenDecimals[takerToken])
  }
  //console.log(bestSwapAmountsOuter)
  //console.log(bestPathReturnsOuter)
  return [bestReturnAmount, bestSwapAmountsOuter, bestPathOuter, bestPathReturnsOuter]
}

function balancerData(takerToken, makerToken, takerAmount) {
  let pools = getTokensPools(takerToken, makerToken)
  if (pools.length == 0) {
      return [DN("0"), [takerAmount], [pools[0]], [DN("0")]]
  }
  let totalbo = DN("0")
  let path = []
  let amounts = []
  for (let p = 0; p < pools.length; p++) {
    let pool = pools[p]
    let poolTokens = pool.tokens
    if (pool.amp >= 10) {
      for (let t = 0; t < poolTokens.length; t++) {
        let token = poolTokens[t]
        if (token.address == makerToken.toLowerCase()) {
          totalbo = totalbo.plus(token.balance)
          path.push(pool)
          amounts.push(DN(token.balance))
        }
      }
    }
  }
  for (let p = 0; p < path.length; p++) {
    amounts[p] = amounts[p].times(takerAmount).div(totalbo)
  }

  if (takerAmount.lte(totalbo.div("4"))) {
    let returns = _.cloneDeep(amounts)
    returns.forEach((amount, index, array) => array[index] = outGivenInS(takerToken, makerToken, amount, path[index]))
    let returnAmount = returns.reduce((prev, curr) => prev.plus(curr))
    return [returnAmount, amounts, path, returns]
  } else {
    try {
      let res = quoteWeighted(takerToken, makerToken, takerAmount, pools)
      return res
    } catch (error) {
      console.log(names[takerToken + names[makerToken]])
      console.log(error)
      return [DN("0"), [takerAmount], [pools[0]], [DN("0")]]
    }
  }
}

function quote(takerToken, makerToken, takerAmount) {
  let amountDN = DN(takerAmount.toString()).div(DN(String(10**tokenDecimals[takerToken])))
  //console.log(names[takerToken]+names[makerToken])
  let res = balancerData(takerToken, makerToken, amountDN)
  //console.log("Quote:", names[takerToken]+names[makerToken])
  //console.log(res[0].div(amountDN))
  //console.log("res:", res)
  let qAmount = new Promise((resolve, reject) => {
    resolve(res[0].div(amountDN).toDP(12).toNumber())
  })
  let cleanRes = cleanQData(res, amountDN, tokenDecimals[takerToken], tokenDecimals[makerToken])
  let qData = new Promise((resolve, reject) => {
    resolve({
      total: amountDN.times(DN(String(10**tokenDecimals[takerToken]))).toString(),
      returnAmount: cleanRes[0].times(DN(String(10**tokenDecimals[makerToken]))).toString(),
      amountsIn: cleanRes[1],
      path: cleanRes[2],
      pathReturns: cleanRes[3],
      swapAddr: getSwapAddr(),
      approveAddr: getSwapAddr()
    })
  })
  return Promise.all([qAmount, qData])
}

//TODO: exact amount and remove zero amounts
function cleanQData(res, amountIn, takerDecimals, makerDecimals) {
  let swapAmounts = res[1]
  //console.log("swap amounts:", swapAmounts)
  for (let a = 0; a < swapAmounts.length; a++) {
    swapAmounts[a] = swapAmounts[a].toNearest(DN("0.1").pow(takerDecimals))
    if (swapAmounts[a].eq(DN("0"))) {
      //console.log("splice")
      swapAmounts.splice(a, 1)
      res[2].splice(a, 1)
      res[3].splice(a, 1)
    }
  }

  let total = swapAmounts.reduce((accum, curr) => accum.plus(curr))
  //console.log("total:", total)
  let excess = total.minus(amountIn)
  swapAmounts[0] = swapAmounts[0].minus(excess)

  //TODO: Find a better way without rounding twice
  res[0] = res[0].toNearest(DN("0.1").pow(makerDecimals))

  res[1] = swapAmounts
  return res
}

function trnscDataNoAmount(takerToken, makerToken, data, addr) {
  let swapAmounts = data.amountsIn
  console.log("totalAmount", data.total)
  console.log("totalAmount", data.total.toString())
  let totalAmount = DN(data.total).div(10**tokenDecimals[takerToken]).toString()
  let path = data.path

  var fundSettings = {
      //"sender":               process.env.address,
      //"recipient":            process.env.address,
      "sender": addr,
      "recipient": addr,
      //"sender":               ARBITRAGE_ADDRESS,
      //"recipient":            ARBITRAGE_ADDRESS,
      "fromInternalBalance": false,
      "toInternalBalance": false
  };

  var deadline = web3.utils.toBN(String(Math.round(Date.now()/1000 + 600)));

  //console.log("test")
  //console.log("swapAmounts:", swapAmounts)
  //console.log("path:", path)
  //console.log("expRet:", expRet)
  //console.log("expPathRets:", expPathRets)

  const takerData = {
    "symbol": names[takerToken],
    "decimals": tokenDecimals[takerToken],
    "limit": DN(totalAmount).times(2)
  }

  const makerData = {
    "symbol": names[makerToken],
    "decimals": tokenDecimals[makerToken],
    "limit": DN("0")
    //"limit": DN(expRet).times(0.95).neg()
  }

  const tokenData = {}
    tokenData[takerToken] = takerData
    tokenData[makerToken] = makerData

  var swapSteps = Array(swapAmounts.length)
  for (let a = 0; a < swapAmounts.length; a++) {
    swapSteps[a] = {
      "poolId": path[a].id,
      "assetIn": takerToken,
      "assetOut": makerToken,
      "amount": swapAmounts[a]
    }
  }
  const swapKind = 0

  var indices = {}
  let sorted = [takerToken, makerToken].sort()
  if (sorted[0] == takerToken) {
    indices[takerToken] = 0
    indices[makerToken] = 1
  } else {
    indices[takerToken] = 1
    indices[makerToken] = 0
  }


  const swapStepsStruct = [];
  for (const step of swapSteps) {
    if (step.amount.eq(DN("0"))) {
      continue
    }
      const swapStepStruct = {
          poolId: step["poolId"],
          assetInIndex: indices[takerToken],
          assetOutIndex: indices[makerToken],
          amount: step.amount.times(DN("10").pow(tokenDecimals[takerToken])).toString(),
          userData: '0x'
      };
      swapStepsStruct.push(swapStepStruct);
  }
  swapStepsStruct[0].amount = "44512891635166917309470866438905221514771660592425113995951798165235625039842"

  const fundStruct = {
      sender: web3.utils.toChecksumAddress(fundSettings["sender"]),
      fromInternalBalance: fundSettings["fromInternalBalance"],
      recipient: web3.utils.toChecksumAddress(fundSettings["recipient"]),
      toInternalBalance: fundSettings["toInternalBalance"]
  };

  const tokenLimits = []
  const checksumTokens = []
  for (const token of sorted) {
    tokenLimits.push(tokenData[token].limit.times(DN("10").pow(tokenDecimals[token])).round().toString())
    checksumTokens.push(web3.utils.toChecksumAddress(token));
  }

  /*
  console.log("encoding")
  console.log("swapKind: ", swapKind)
  console.log("swapStepsStruct: ", swapStepsStruct)
  console.log("checksumTokens: ", checksumTokens)
  console.log("fundStruct: ", fundStruct)
  console.log("tokenLimits: ", tokenLimits)
  console.log("deadline: ", deadline.toString())
  */

  const funcData = balancerContract.methods.batchSwap(
    swapKind,
    swapStepsStruct,
    checksumTokens,
    fundStruct,
    tokenLimits,
    deadline.toString()
  ).encodeABI()

  return funcData
}

function trnscData(takerToken, makerToken, data, addr) {
  let swapAmounts = data.amountsIn
  let totalAmount = DN(data.total).div(10**tokenDecimals[takerToken]).toString()
  let path = data.path
  //let expRet = DN(data.returnAmount).div(10**tokenDecimals[makerToken]).toString()
  //let expPathRets = data.pathReturns

  var fundSettings = {
      //"sender":               process.env.address,
      //"recipient":            process.env.address,
      "sender": addr,
      "recipient": addr,
      //"sender":               ARBITRAGE_ADDRESS,
      //"recipient":            ARBITRAGE_ADDRESS,
      "fromInternalBalance": false,
      "toInternalBalance": false
  };

  var deadline = web3.utils.toBN(String(Math.round(Date.now()/1000 + 600)));

  //console.log("test")
  //console.log("swapAmounts:", swapAmounts)
  //console.log("path:", path)
  //console.log("expRet:", expRet)
  //console.log("expPathRets:", expPathRets)

  const takerData = {
    "symbol": names[takerToken],
    "decimals": tokenDecimals[takerToken],
    "limit": DN(totalAmount).times(1.1)
  }

  const makerData = {
    "symbol": names[makerToken],
    "decimals": tokenDecimals[makerToken],
    "limit": DN("0")
    //"limit": DN(expRet).times(0.95).neg()
  }

  const tokenData = {}
    tokenData[takerToken] = takerData
    tokenData[makerToken] = makerData

  var swapSteps = Array(swapAmounts.length)
  for (let a = 0; a < swapAmounts.length; a++) {
    swapSteps[a] = {
      "poolId": path[a].id,
      "assetIn": takerToken,
      "assetOut": makerToken,
      "amount": swapAmounts[a]
    }
  }
  const swapKind = 0

  var indices = {}
  let sorted = [takerToken, makerToken].sort()
  if (sorted[0] == takerToken) {
    indices[takerToken] = 0
    indices[makerToken] = 1
  } else {
    indices[takerToken] = 1
    indices[makerToken] = 0
  }


  const swapStepsStruct = [];
  for (const step of swapSteps) {
    if (step.amount.eq(DN("0"))) {
      continue
    }
      const swapStepStruct = {
          poolId: step["poolId"],
          assetInIndex: indices[takerToken],
          assetOutIndex: indices[makerToken],
          amount: step.amount.times(DN("10").pow(tokenDecimals[takerToken])).toString(),
          userData: '0x'
      };
      swapStepsStruct.push(swapStepStruct);
  }

  const fundStruct = {
      sender: web3.utils.toChecksumAddress(fundSettings["sender"]),
      fromInternalBalance: fundSettings["fromInternalBalance"],
      recipient: web3.utils.toChecksumAddress(fundSettings["recipient"]),
      toInternalBalance: fundSettings["toInternalBalance"]
  };

  const tokenLimits = []
  const checksumTokens = []
  for (const token of sorted) {
    tokenLimits.push(tokenData[token].limit.times(DN("10").pow(tokenDecimals[token])).round().toString())
    checksumTokens.push(web3.utils.toChecksumAddress(token));
  }

  /*
  console.log("encoding")
  console.log("swapKind: ", swapKind)
  console.log("swapStepsStruct: ", swapStepsStruct)
  console.log("checksumTokens: ", checksumTokens)
  console.log("fundStruct: ", fundStruct)
  console.log("tokenLimits: ", tokenLimits)
  console.log("deadline: ", deadline.toString())
  */

  const funcData = balancerContract.methods.batchSwap(
    swapKind,
    swapStepsStruct,
    checksumTokens,
    fundStruct,
    tokenLimits,
    deadline.toString()
  ).encodeABI()

  return funcData
}

//assuming same length
function pathEquals(p0, p1) {
  for (let p = 0; p < p0.length; p++) {
    try {
      if (p0[p].id != p1[p].id) {
        return false
      }
    } catch (error) {
      console.log(p0)
      console.log(p1)
      console.log(error)
    }
  }
  return true
}

function decimalToBN(bigdecimal) {
  bigdecimal = bigdecimal.replace('.', '')
  //console.log(bigdecimal)
  return BN(bigdecimal)
}

async function testIter() {
  let pools = await getPools(WETH, USDC)
  let swapAmounts = [DN('1'), DN('0.5'), DN('1')]
  let best = getBestPathIds(WETH, USDC, swapAmounts, pools)
  let path = best[0]
  let returns = best[1]
  console.log("RETURNS", returns)
  console.log("TOTAL", best[2])
  let iterate = iterateSwapAmountsApproximation(swapAmounts, path, returns, WETH, USDC)
  console.log("ITER", iterate)
  let newReturns = Array(swapAmounts.length)
  let total = DN("0")
  for (let a = 0; a < swapAmounts.length; a++) {
    newReturns[a] = outGivenIn(WETH, USDC, iterate[0][a], path[a])
    total = total.plus(newReturns[a])
  }
  console.log("NEW", newReturns)
  console.log("NEW TOTAL", total)
}
//testIter()

async function stable() {
  let pools = await getPools(USDC, USDT)
  for (let p = 0; p < pools.length; p++) {
    let pool = pools[p]
    if (pool.amp >= 10) {
      console.log("STABLE")
      console.log(pool.amp)
    }
  }
}
//stable()

async function main() {
  let taker = USDC
  let maker = DAI
  await getPools()
  let rate = await quote(taker, maker, web3.utils.toBN("1000000").mul(web3.utils.toBN(String(10**(tokenDecimals[taker])))))
  console.log("RATE", rate)
  let data = await rate[1]
  console.log("data", data)
  console.log("paths", data.path)
  console.log("TRANSAC DATA")
  console.log("---------------")
  let callData = trnscDataNoAmount(taker, maker, data, process.env.CONTRACT_ADDRESS)
  console.log(callData)
}
//main()

async function getPoolsTest() {
  await getPools()
  //console.log(POOLS)
  let pools = getTokensPools(WETH, DAI)
  console.log(pools)
  let taker = WETH
  let maker = DAI
  let rate = outGivenIn(taker, maker, DN("0.0001"), pools[0])
  console.log(rate.toString())
}
//getPoolsTest()


module.exports = {
  quote, getPools, getTokensPools,
  trnscData, trnscDataNoAmount, getSwapAddr,
  outGivenIn,
}
