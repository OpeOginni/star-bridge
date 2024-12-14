// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

error TokenNotAccepted(IERC20 token);
error NotEnoughTokenBalance(IERC20 token, uint256 balance);
error NotEnoughNativeBalance(uint256 balance);

contract StarBridgeVault is Ownable{
    using SafeERC20 for IERC20;

    mapping(IERC20 => bool) acceptedTokens;

    constructor(IERC20[] memory _acceptedTokens) Ownable(msg.sender) {
        acceptedTokens[IERC20(address(0))] = true;

        for (uint256 i; i < _acceptedTokens.length;) {
            acceptedTokens[_acceptedTokens[i]] = true;
            unchecked {
                i++;
            }
        }
    }

    function addAcceptedToken(IERC20 _token) public onlyOwner {
        acceptedTokens[_token] = true;
    }

    function removeAcceptedToken(IERC20 _token) public onlyOwner {
        acceptedTokens[_token] = false;
    }

    function deposit(IERC20 _token, uint256 _amount) public payable {
        if(_token != IERC20(address(0))) {
            // ERC20 Token
            if(!acceptedTokens[_token])
                revert TokenNotAccepted(_token);
            _token.safeTransferFrom(msg.sender, address(this), _amount);
        }
    }

    function emergencyWithdraw(IERC20 _token) public onlyOwner {
        if(_token == IERC20(address(0))) {
            // Native Currency
            (bool sent, bytes memory data) = msg.sender.call{value: address(this).balance}("");
            require(sent, "Failed to send Ether");
        } else {
            // ERC20 Token
            _token.safeTransfer(msg.sender, _token.balanceOf(address(this)));
        }
    }

    function payout(IERC20 _token, uint256 _amount, address _to) public onlyOwner {
        if(_token == IERC20(address(0))) {
            // Native Currency
            if(address(this).balance < _amount) 
                revert NotEnoughNativeBalance(address(this).balance);

            (bool sent, bytes memory data) = _to.call{value: _amount}("");
            require(sent, "Failed to send Ether");
        } else {
            // ERC20 Token

            if(!acceptedTokens[_token])
                revert TokenNotAccepted(_token);
            
            if(_token.balanceOf(address(this)) < _amount)
                revert NotEnoughTokenBalance(_token, _token.balanceOf(address(this)));

            _token.safeTransfer(_to, _amount);
        }
    }

    function isTokenAccepted(IERC20 _token) public view returns (bool) {
        return acceptedTokens[_token];
    }

    receive() external payable {}
}
