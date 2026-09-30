// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ScoutDrop
/// @notice Holds a launch's graduation airdrop and pays it out against a Merkle root
///         produced by Graduation Scout.
/// @dev Leaves follow OpenZeppelin's StandardMerkleTree for (address, uint256):
///      keccak256(bytes.concat(keccak256(abi.encode(account, amount)))).
///
///      Design choices:
///      - Anyone can submit a claim for any recipient; tokens always go to the recipient.
///        That lets a keeper push the whole list at graduation, so recipients don't need gas.
///      - The creator deposits exactly the allocated total up front. Fee-on-transfer deposits
///        revert: the drop must be fully funded or it can't pay everyone.
///      - There is no cancel. After the deadline, anything unclaimed can only go to the `sink`
///        fixed at creation (a burn address by default in Scout's UI), and anyone can trigger it.
///      - `policyHash` commits to the Scout policy that produced the root, so anyone can
///        re-resolve it and check the list.
///      - Each drop's payouts are capped at its own deposit, so drops sharing a token can't
///        dip into each other. Not for rebasing tokens, whose balance can shrink under the contract.
contract ScoutDrop is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Drop {
        IERC20 token;
        address creator;
        address sink;
        uint64 deadline;
        bytes32 merkleRoot;
        bytes32 policyHash;
        uint256 total;
        uint256 claimed;
        bool swept;
    }

    uint64 public constant MIN_CLAIM_PERIOD = 1 days;
    uint64 public constant MAX_CLAIM_PERIOD = 365 days;

    uint256 public dropCount;
    mapping(uint256 dropId => Drop) public drops;
    mapping(uint256 dropId => mapping(address account => bool)) public hasClaimed;

    event DropCreated(
        uint256 indexed dropId,
        address indexed token,
        address indexed creator,
        bytes32 merkleRoot,
        bytes32 policyHash,
        uint256 total,
        uint64 deadline,
        address sink
    );
    event Claimed(uint256 indexed dropId, address indexed account, uint256 amount, address submitter);
    event Swept(uint256 indexed dropId, address indexed sink, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error EmptyRoot();
    error BadClaimPeriod();
    error FeeOnTransferUnsupported(uint256 expected, uint256 received);
    error UnknownDrop(uint256 dropId);
    error DropExpired(uint256 dropId);
    error DropNotExpired(uint256 dropId);
    error AlreadyClaimed(uint256 dropId, address account);
    error InvalidProof(uint256 dropId, address account);
    error AlreadySwept(uint256 dropId);
    error Overdrawn(uint256 dropId);
    error LengthMismatch();

    /// @notice Funds a new drop. Pulls `total` tokens from the caller (approve first).
    /// @param claimPeriod Seconds from now until unclaimed tokens can be swept to `sink`.
    function createDrop(
        IERC20 token,
        bytes32 merkleRoot,
        bytes32 policyHash,
        uint256 total,
        uint64 claimPeriod,
        address sink
    ) external nonReentrant returns (uint256 dropId) {
        if (address(token) == address(0) || sink == address(0)) revert ZeroAddress();
        if (total == 0) revert ZeroAmount();
        if (merkleRoot == bytes32(0)) revert EmptyRoot();
        if (claimPeriod < MIN_CLAIM_PERIOD || claimPeriod > MAX_CLAIM_PERIOD) revert BadClaimPeriod();

        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), total);
        uint256 received = token.balanceOf(address(this)) - before;
        if (received != total) revert FeeOnTransferUnsupported(total, received);

        dropId = ++dropCount;
        uint64 deadline = uint64(block.timestamp) + claimPeriod;
        drops[dropId] = Drop({
            token: token,
            creator: msg.sender,
            sink: sink,
            deadline: deadline,
            merkleRoot: merkleRoot,
            policyHash: policyHash,
            total: total,
            claimed: 0,
            swept: false
        });
        emit DropCreated(dropId, address(token), msg.sender, merkleRoot, policyHash, total, deadline, sink);
    }

    /// @notice Pays `amount` to `account` if the proof matches. Callable by anyone.
    function claim(uint256 dropId, address account, uint256 amount, bytes32[] calldata proof) external nonReentrant {
        _claim(dropId, account, amount, proof);
    }

    /// @notice Batch version of `claim`, for keepers pushing a whole allocation.
    function claimMany(
        uint256 dropId,
        address[] calldata accounts,
        uint256[] calldata amounts,
        bytes32[][] calldata proofs
    ) external nonReentrant {
        if (accounts.length != amounts.length || accounts.length != proofs.length) revert LengthMismatch();
        for (uint256 i = 0; i < accounts.length; i++) {
            _claim(dropId, accounts[i], amounts[i], proofs[i]);
        }
    }

    /// @notice After the deadline, sends whatever is unclaimed to the drop's sink. Callable by anyone.
    function sweep(uint256 dropId) external nonReentrant {
        Drop storage d = _get(dropId);
        if (block.timestamp <= d.deadline) revert DropNotExpired(dropId);
        if (d.swept) revert AlreadySwept(dropId);
        d.swept = true;
        uint256 rest = d.total - d.claimed;
        if (rest > 0) d.token.safeTransfer(d.sink, rest);
        emit Swept(dropId, d.sink, rest);
    }

    /// @notice Whether `account` can claim `amount` from `dropId` with `proof` right now.
    function canClaim(uint256 dropId, address account, uint256 amount, bytes32[] calldata proof) external view returns (bool) {
        Drop storage d = drops[dropId];
        if (address(d.token) == address(0) || block.timestamp > d.deadline || hasClaimed[dropId][account]) return false;
        if (amount > d.total - d.claimed) return false;
        return MerkleProof.verifyCalldata(proof, d.merkleRoot, _leaf(account, amount));
    }

    function _claim(uint256 dropId, address account, uint256 amount, bytes32[] calldata proof) private {
        Drop storage d = _get(dropId);
        if (block.timestamp > d.deadline) revert DropExpired(dropId);
        if (amount == 0) revert ZeroAmount();
        if (hasClaimed[dropId][account]) revert AlreadyClaimed(dropId, account);
        if (!MerkleProof.verifyCalldata(proof, d.merkleRoot, _leaf(account, amount))) revert InvalidProof(dropId, account);
        // A root whose leaves sum past the deposit can't drain other drops' tokens.
        if (amount > d.total - d.claimed) revert Overdrawn(dropId);

        hasClaimed[dropId][account] = true;
        d.claimed += amount;
        d.token.safeTransfer(account, amount);
        emit Claimed(dropId, account, amount, msg.sender);
    }

    function _get(uint256 dropId) private view returns (Drop storage d) {
        d = drops[dropId];
        if (address(d.token) == address(0)) revert UnknownDrop(dropId);
    }

    function _leaf(address account, uint256 amount) private pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
    }
}
