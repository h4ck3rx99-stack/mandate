// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RevocationRegistry} from "../src/RevocationRegistry.sol";

contract RevocationRegistryTest is Test {
    RevocationRegistry reg;
    address owner = address(0xA11CE);
    address ops = address(0x0B5);
    address stranger = address(0xBAD);
    bytes32 rootId = keccak256("root");
    bytes32 opsId = keccak256("ops-link");

    event Revoked(address indexed issuer, bytes32 indexed id);

    function setUp() public {
        reg = new RevocationRegistry();
    }

    function _chain() internal view returns (address[] memory issuers, bytes32[] memory ids) {
        issuers = new address[](2);
        ids = new bytes32[](2);
        (issuers[0], ids[0]) = (owner, rootId);
        (issuers[1], ids[1]) = (ops, opsId);
    }

    function test_revokeOwnNamespaceOnly() public {
        vm.prank(owner);
        reg.revoke(rootId);
        assertTrue(reg.revoked(owner, rootId));
        assertFalse(reg.revoked(ops, rootId));
    }

    function test_strangerCannotAffectVictim() public {
        vm.prank(stranger);
        reg.revoke(rootId);
        (address[] memory issuers, bytes32[] memory ids) = _chain();
        assertFalse(reg.anyRevoked(issuers, ids));
        assertFalse(reg.revoked(owner, rootId));
    }

    function test_revokingAncestorKillsChain() public {
        (address[] memory issuers, bytes32[] memory ids) = _chain();
        assertFalse(reg.anyRevoked(issuers, ids));
        vm.prank(owner);
        reg.revoke(rootId);
        assertTrue(reg.anyRevoked(issuers, ids));
        bool[] memory s = reg.statusOf(issuers, ids);
        assertTrue(s[0]);
        assertFalse(s[1]);
    }

    function test_doubleRevokeReverts() public {
        vm.startPrank(owner);
        reg.revoke(rootId);
        vm.expectRevert(RevocationRegistry.AlreadyRevoked.selector);
        reg.revoke(rootId);
        vm.stopPrank();
    }

    function test_emitsRevoked() public {
        vm.expectEmit(true, true, false, false, address(reg));
        emit Revoked(owner, rootId);
        vm.prank(owner);
        reg.revoke(rootId);
    }

    function test_lengthMismatchReverts() public {
        address[] memory issuers = new address[](2);
        bytes32[] memory ids = new bytes32[](1);
        vm.expectRevert(RevocationRegistry.LengthMismatch.selector);
        reg.anyRevoked(issuers, ids);
        vm.expectRevert(RevocationRegistry.LengthMismatch.selector);
        reg.statusOf(issuers, ids);
    }

    function testFuzz_onlySenderNamespace(address who, bytes32 id) public {
        vm.assume(who != owner);
        vm.prank(who);
        reg.revoke(id);
        assertTrue(reg.revoked(who, id));
        assertFalse(reg.revoked(owner, id));
    }
}
