// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RevocationRegistry
/// @notice Each issuer can revoke delegation ids only in its own namespace. Verifiers pass the
///         (issuer, id) pair for every link in a chain; revoking an ancestor kills all descendants
///         because every descendant chain contains that ancestor link. No enumeration needed.
contract RevocationRegistry {
    mapping(address issuer => mapping(bytes32 id => bool)) public revoked;

    event Revoked(address indexed issuer, bytes32 indexed id);

    error LengthMismatch();
    error AlreadyRevoked();

    /// @notice Revoke `id` in msg.sender's namespace.
    function revoke(bytes32 id) external {
        if (revoked[msg.sender][id]) revert AlreadyRevoked();
        revoked[msg.sender][id] = true;
        emit Revoked(msg.sender, id);
    }

    /// @notice True if any (issuers[i], ids[i]) is revoked.
    function anyRevoked(address[] calldata issuers, bytes32[] calldata ids) external view returns (bool) {
        if (issuers.length != ids.length) revert LengthMismatch();
        for (uint256 i = 0; i < ids.length; i++) {
            if (revoked[issuers[i]][ids[i]]) return true;
        }
        return false;
    }

    /// @notice Per-link revocation status.
    function statusOf(address[] calldata issuers, bytes32[] calldata ids) external view returns (bool[] memory out) {
        if (issuers.length != ids.length) revert LengthMismatch();
        out = new bool[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            out[i] = revoked[issuers[i]][ids[i]];
        }
    }
}
