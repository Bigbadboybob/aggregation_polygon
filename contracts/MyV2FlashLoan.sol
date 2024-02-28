// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import { FlashLoanReceiverBase } from "./FlashLoanReceiverBase.sol";
import { ILendingPool, ILendingPoolAddressesProvider, IERC20 } from "./Interfaces.sol";
import { SafeMath } from "./Libraries.sol";

/** 
    !!!
    Never keep funds permanently on your FlashLoanReceiverBase contract as they could be 
    exposed to a 'griefing' attack, where the stored funds are used by an attacker.
    !!!
 */
contract MyV2FlashLoan is FlashLoanReceiverBase {
    using SafeMath for uint256;

    event Log(string message, uint val);
    event Log(string message, bytes val);

    address payable OWNER;

    fallback () external payable {}

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == OWNER, "caller is not the owner!");
        _;
    }

    //TODO:Find address provider and see how to deploy contract with constructor
    constructor(address _addressProvider) FlashLoanReceiverBase(_addressProvider) public {
        //emit Log('constructor', 8);
        OWNER = payable(msg.sender);
    }

    struct swap {
        address swapAddr;
        address approveAddr;
        bytes swapData;
        address takerAddr;
        uint256 takerAmount;
    }

    function myFlashLoanCall(swap[] calldata swaps) external payable {
        address receiverAddress = address(this);

        address[] memory assets = new address[](1);
        assets[0] = swaps[0].takerAddr;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = swaps[0].takerAmount;

        // 0 = no debt, 1 = stable, 2 = variable
        uint256[] memory modes = new uint256[](1);
        modes[0] = 0;

        bytes memory params = abi.encode(swaps);

        address onBehalfOf = address(this);
        uint16 referralCode = 0;

        LENDING_POOL.flashLoan(
            receiverAddress,
            assets,
            amounts,
            modes,
            onBehalfOf,
            params,
            referralCode
        );
    }

    function intToString(uint256 val) pure internal returns (string memory) {
        bytes memory reversed = new bytes(100);
        uint i = 0;
        while (val != 0 && i < 100) {
            uint8 digit  = uint8(val % 10);
            val /= 10;
            reversed[i] = byte(digit + 48);
            i++;
        }
        bytes memory s = new bytes(i);
        i--;
        for (uint j = 0; j < i + 1; j++) {
            s[j] = reversed[i - j];
        }
        return string(s);
    }

    function strConcat(string memory str0, string memory str1) pure internal returns (string memory) {
        bytes memory b0 = bytes(str0);
        bytes memory b1 = bytes(str1);
        string memory temp = new string(b0.length + b1.length);
        bytes memory b = bytes(temp);
        //bytes memory b;
        uint i = 0;
        for (i;i < b0.length; i++) {
            b[i] = b0[i];
        }
        for (uint j = 0; j < b1.length; j++) {
            b[i+j] = b1[j];
        }
        return string(b);
    }

    function replaceBytes(bytes memory b, bytes8 id, bytes32 repl) internal returns (bytes memory) {
        //construct search bytes
        bytes32 gen = 0x626967626164626F79626F622072756C657321000000000000000000E2DB17E2;
        bytes32 search = bytes32(id) >> 20*8;
        search = gen | search;

        //search for index
        uint c = 0;
        uint i = 0;
        for (i; i < b.length; i++) {
            if (b[i] == search[c]) {
                c++;
            } else {
                c = 0;
            }
            if (c == 32) {
                break;
            }
        }

        
        
        //does nothing if bytes not found
        if (c != 32) {
            emit Log("not found", c);
            return b;
        }
        emit Log("found", c);
        
        
        i -= 31;
        //replace
        for (uint j = 0; j < 32; j++) {
            b[i+j] = repl[j];
        }
        
        return b;
    }

    /**
        This function is called after your contract has received the flash loaned amount
     */
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    )
        external
        override
        returns (bool)
    {
        (swap[] memory swaps) = abi.decode(params, (swap[]));


        uint256 startBalance = IERC20(assets[0]).balanceOf(address(this));
        require(startBalance >= amounts[0], "contract did not get the loan");
        //Perform arbitrage
        bytes8 takerAmountID = 0x0000007ace4a302d;
        //bytes8 minOutID = 0x0000000000031207;
        uint j;
        for (uint i = 0; i < swaps.length; i++) {
            if (i < swaps.length - 1) {
                j = i + 1;
            } else {
                j = 0;
            }
            uint256 balanceBefore = IERC20(swaps[i].takerAddr).balanceOf(address(this));
            emit Log("TakerBalance Before:", balanceBefore);
            emit Log("takerAmount", swaps[i].takerAmount);
            //balancer case
            if (swaps[i].swapAddr == 0xBA12222222228d8Ba445958a75a0704d566BF2C8) {
                swaps[i].swapData = replaceBytes(swaps[i].swapData, takerAmountID, bytes32(balanceBefore-swaps[i].takerAmount));
            } else {
                swaps[i].swapData = replaceBytes(swaps[i].swapData, takerAmountID, bytes32(balanceBefore));
            }
            swaps[i].takerAmount = balanceBefore;
            //require(balanceBefore >= swaps[i].takerAmount, strConcat(intToString(i) , strConcat("balance too low: ", intToString(balanceBefore))));

            uint256 balanceAfter = IERC20(swaps[j].takerAddr).balanceOf(address(this));
            emit Log("MakerBalance Before:", balanceAfter);
            _trade(swaps[i]);
        }

        uint256 endBalance = IERC20(assets[0]).balanceOf(address(this));

        uint256 amountOwing = amounts[0].add(premiums[0]);
        IERC20(assets[0]).approve(address(LENDING_POOL), amountOwing);

        emit Log("endBal", endBalance);
        emit Log("startBal", startBalance);
        //require(endBalance > startBalance, strConcat(strConcat(intToString(startBalance), "End balance must exceed start balance."), intToString(endBalance)));
        emit Log("repay", amountOwing);
        emit Log("bal - repay", endBalance - amountOwing);
        return true;
    }

    function _trade(swap memory _swap) internal {
        // Approve tokens
        IERC20 _fromIERC20 = IERC20(_swap.takerAddr);
        
        bool approval;
        approval = _fromIERC20.approve(_swap.approveAddr, _swap.takerAmount);
        
        uint app = 2;
        if (approval) {
            app = 1;
        } else {
            app = 0;
        }
        emit Log("approval", app);
        
        bool swapSuccess;
        bytes memory result;
        //gasprice*70000 is protocol fee
        (swapSuccess, result) = address(_swap.swapAddr).call{ gas: 1000000}(_swap.swapData);
        
        app = 2;
        if (swapSuccess) {
            app = 1;
        } else {
            app = 0;
        }
        emit Log("success", app);
        emit Log("result", result);

        // Reset approval
        _fromIERC20.approve(_swap.takerAddr, 0);
    }

    // KEEP THIS FUNCTION IN CASE THE CONTRACT RECEIVES TOKENS!
    function withdrawToken(address _tokenAddress) public onlyOwner {
        uint256 balance = IERC20(_tokenAddress).balanceOf(address(this));
        IERC20(_tokenAddress).transfer(OWNER, balance);
    }

    // KEEP THIS FUNCTION IN CASE THE CONTRACT KEEPS LEFTOVER ETHER!
    function withdrawEther() public onlyOwner {
        address self = address(this); // workaround for a possible solidity bug
        uint256 balance = self.balance;
        OWNER.transfer(balance);
    }

    function setOwner(address payable _newOwner) public onlyOwner {
        OWNER = _newOwner;
    }

}
