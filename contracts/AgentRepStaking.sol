// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AgentRepStaking
 * @notice Staking and slashing for AgentRep reputation system on Hedera.
 *
 *         Hedera-specific design:
 *         - The backend operator calls all functions (msg.sender is always the operator).
 *         - Agent identity is passed as a parameter (agentId bytes32), NOT derived from msg.sender.
 *         - HBAR is sent via payable functions (Hedera Smart Contract Service handles this).
 *         - receive()/fallback() are NOT used (Hedera native transfers don't trigger them).
 */
contract AgentRepStaking {
    // ============================================
    // State
    // ============================================

    address public owner;
    address public reputationOracle; // Backend service that can trigger slashes

    struct Stake {
        uint256 amount;         // Total staked (in tinybar)
        uint256 lockedUntil;    // Timestamp until which stake is locked
        uint256 totalSlashed;   // Cumulative slashed amount
        bool exists;
    }

    // agentId (keccak256 of agent string ID) => Stake
    mapping(bytes32 => Stake) public stakes;

    // All agent IDs for enumeration
    bytes32[] public stakerIds;

    uint256 public totalStaked;
    uint256 public totalSlashed;
    uint256 public stakerCount;

    uint256 public constant MIN_STAKE = 1 * 1e8;              // 1 HBAR in tinybar
    uint256 public constant MIN_LOCK_PERIOD = 7 days;
    uint256 public constant MAX_SLASH_PERCENT = 30;            // Max 30% slash per event

    // ============================================
    // Events
    // ============================================

    event Staked(bytes32 indexed agentId, uint256 amount, uint256 lockedUntil);
    event Unstaked(bytes32 indexed agentId, uint256 amount);
    event Slashed(bytes32 indexed agentId, uint256 amount, string reason);
    event OracleUpdated(address indexed newOracle);

    // ============================================
    // Modifiers
    // ============================================

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == reputationOracle || msg.sender == owner, "Only oracle or owner");
        _;
    }

    // ============================================
    // Constructor
    // ============================================

    constructor(address _reputationOracle) {
        owner = msg.sender;
        reputationOracle = _reputationOracle;
    }

    // ============================================
    // Staking Functions
    // ============================================

    /**
     * @notice Stake HBAR as reputation collateral for an agent.
     * @param agentId Keccak256 hash of the agent's string ID.
     * @param lockDays Number of days to lock the stake (min 7).
     *
     * On Hedera, the operator backend calls this and sends HBAR via
     * ContractExecuteTransaction.setPayableAmount().
     */
    function stake(bytes32 agentId, uint256 lockDays) external payable onlyOracle {
        require(msg.value >= MIN_STAKE, "Below minimum stake");
        require(lockDays * 1 days >= MIN_LOCK_PERIOD, "Lock period too short");

        uint256 lockedUntil = block.timestamp + (lockDays * 1 days);

        if (!stakes[agentId].exists) {
            stakes[agentId] = Stake({
                amount: msg.value,
                lockedUntil: lockedUntil,
                totalSlashed: 0,
                exists: true
            });
            stakerIds.push(agentId);
            stakerCount++;
        } else {
            stakes[agentId].amount += msg.value;
            if (lockedUntil > stakes[agentId].lockedUntil) {
                stakes[agentId].lockedUntil = lockedUntil;
            }
        }

        totalStaked += msg.value;
        emit Staked(agentId, msg.value, lockedUntil);
    }

    /**
     * @notice Unstake — withdraw HBAR after lock period (sent back to operator).
     * @param agentId The agent whose stake to withdraw.
     */
    function unstake(bytes32 agentId) external onlyOracle {
        Stake storage s = stakes[agentId];
        require(s.exists, "No stake found");
        require(block.timestamp >= s.lockedUntil, "Stake still locked");
        require(s.amount > 0, "Nothing to unstake");

        uint256 amount = s.amount;
        s.amount = 0;
        totalStaked -= amount;

        // Send HBAR back to the caller (operator)
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        emit Unstaked(agentId, amount);
    }

    /**
     * @notice Slash an agent's stake for bad behavior (called by oracle/owner).
     * @param agentId The agent to slash.
     * @param percent Percentage to slash (1-30).
     * @param reason Human-readable reason for the slash.
     */
    function slash(
        bytes32 agentId,
        uint256 percent,
        string calldata reason
    ) external onlyOracle {
        require(percent > 0 && percent <= MAX_SLASH_PERCENT, "Invalid slash %");

        Stake storage s = stakes[agentId];
        require(s.exists && s.amount > 0, "No stake to slash");

        uint256 slashAmount = (s.amount * percent) / 100;
        s.amount -= slashAmount;
        s.totalSlashed += slashAmount;
        totalStaked -= slashAmount;
        totalSlashed += slashAmount;

        // Slashed funds stay in contract (can be withdrawn by owner for redistribution)
        emit Slashed(agentId, slashAmount, reason);
    }

    // ============================================
    // View Functions
    // ============================================

    function getStake(bytes32 agentId) external view returns (
        uint256 amount,
        uint256 lockedUntil,
        uint256 slashed,
        bool exists
    ) {
        Stake memory s = stakes[agentId];
        return (s.amount, s.lockedUntil, s.totalSlashed, s.exists);
    }

    function getStakerCount() external view returns (uint256) {
        return stakerCount;
    }

    // ============================================
    // Admin Functions
    // ============================================

    function setOracle(address _oracle) external onlyOwner {
        reputationOracle = _oracle;
        emit OracleUpdated(_oracle);
    }

    /**
     * @notice Withdraw slashed funds (only owner, for redistribution).
     */
    function withdrawSlashedFunds(uint256 amount) external onlyOwner {
        uint256 available = address(this).balance - totalStaked;
        require(amount <= available, "Exceeds available slashed funds");
        (bool success, ) = owner.call{value: amount}("");
        require(success, "Transfer failed");
    }
}
