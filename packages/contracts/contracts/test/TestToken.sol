// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only token. `feeBps` > 0 makes it a fee-on-transfer token (like a taxed launch token).
contract TestToken is ERC20 {
    uint256 public immutable feeBps;

    constructor(uint256 supply, uint256 feeBps_) ERC20("Test", "TST") {
        feeBps = feeBps_;
        _mint(msg.sender, supply);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (feeBps == 0 || from == address(0) || to == address(0)) return super._update(from, to, value);
        uint256 fee = (value * feeBps) / 10_000;
        super._update(from, address(0xFEE), fee);
        super._update(from, to, value - fee);
    }
}
