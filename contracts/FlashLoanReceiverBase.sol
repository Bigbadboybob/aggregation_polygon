// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;

import {IFlashLoanReceiver, ILendingPoolAddressesProvider, ILendingPool, IERC20  } from "./Interfaces.sol";
import { SafeERC20, SafeMath } from "./Libraries.sol";

abstract contract FlashLoanReceiverBase is IFlashLoanReceiver {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  //CHANGED: overide
  ILendingPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
  ILendingPool public immutable LENDING_POOL;

  constructor(address providerAddress) public {
    ILendingPoolAddressesProvider provider = ILendingPoolAddressesProvider(providerAddress);
    ADDRESSES_PROVIDER = provider;
    LENDING_POOL = ILendingPool(0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf);
    //address test = provider.getLendingPool();
    //LENDING_POOL = ILendingPool(provider.getLendingPool());
  }
}