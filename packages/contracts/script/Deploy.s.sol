// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {RevocationRegistry} from "../src/RevocationRegistry.sol";

contract Deploy is Script {
    function run() external returns (RevocationRegistry reg) {
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        reg = new RevocationRegistry();
        vm.stopBroadcast();
        console.log("RevocationRegistry", address(reg));
    }
}
