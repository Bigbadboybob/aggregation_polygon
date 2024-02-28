const MyV2FlashLoan = artifacts.require("MyV2FlashLoan");

module.exports = function (deployer) {
  const addressProvider = '0xd05e3E715d945B59290df0ae8eF85c1BdB684744';
  deployer.deploy(MyV2FlashLoan, addressProvider);
};