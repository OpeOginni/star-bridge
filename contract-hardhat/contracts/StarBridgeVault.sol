// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract StarBridgeVault is Ownable{
    using SafeERC20 for IERC20;

    mapping(IERC20 => bool) acceptedTokens;

    constructor(IERC20[] memory _acceptedTokens) Ownable(msg.sender) {
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

    function deposit(IERC20 _token, uint256 _amount) public {
        require(acceptedTokens[_token], "Token not accepted");
        _token.safeTransferFrom(msg.sender, address(this), _amount);
    }

    function emergencyWithdraw(IERC20 _token, uint256 _amount) public {
        _token.safeTransfer(msg.sender, _amount);
    }

    function payout(IERC20 _token, uint256 _amount, address _to) public {
        require(acceptedTokens[_token], "Token not accepted");
        _token.safeTransfer(_to, _amount);
    }

    function isTokenAccepted(IERC20 _token) public view returns (bool) {
        return acceptedTokens[_token];
    }
}
