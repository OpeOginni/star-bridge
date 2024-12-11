// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestFT is ERC20 {
    constructor() ERC20("TestFT", "TEST") {}

    function mint(address _to, uint256 _amount) public {
        _mint(_to, _amount);
    }
}