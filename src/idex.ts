"use strict"
require('dotenv').config()
//const idex = require('@idexio/idex-sdk');
import {
  OrderBookRealTimeClient, RestResponseOrderBookLevel2,
  WebSocketClient
} from '@idexio/idex-sdk';


const webSocketClient = new WebSocketClient({
  apiKey: process.env.IDEX_API_KEY,
  apiSecret: process.env.IDEX_API_SECRET,
  shouldReconnectAutomatically: true,
  sandbox: true,
});


/*
const publicClient = new idex.RestPublicClient({
  sandbox: true,
});
*/

const client = new OrderBookRealTimeClient({
  multiverseChain: 'matic',
  sandbox: false,
  apiKey: process.env.IDEX_API_KEY,
});

const markets = ['IDEX-USD'];
client.start(markets);

async function handleOrderBook(l2: RestResponseOrderBookLevel2) {
  l2 = await client.getOrderBookL2('IDEX-USD', 10);
  //console.log(l2)
}
client.on('ready', handleOrderBook);
client.on('l2Changed', handleOrderBook);