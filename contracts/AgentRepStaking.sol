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
    function stake(bytes32 agentId, uint256 lockDays) external payable {
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
    // Arbiter Staking
    // ============================================

    // Arbiter stakes (separate from regular agent stakes)
    mapping(bytes32 => uint256) public arbiterStakes;
    uint256 public constant MIN_ARBITER_STAKE = 10 * 1e8; // 10 HBAR

    // Dispute bonds
    mapping(uint256 => uint256) public disputeBonds; // disputeId => bond amount
    uint256 public constant DISPUTE_BOND_AMOUNT = 2 * 1e8; // 2 HBAR

    event ArbiterStaked(bytes32 indexed agentId, uint256 amount);
    event DisputeBondDeposited(uint256 indexed disputeId, bytes32 indexed disputerId, uint256 amount);
    event DisputeBondReturned(uint256 indexed disputeId, bytes32 indexed disputerId, uint256 amount);
    event DisputeBondForfeited(uint256 indexed disputeId, bytes32 indexed accusedId, uint256 amount);
    event ArbiterRewarded(bytes32 indexed arbiterId, uint256 amount);

    /**
     * @notice Stake additional HBAR as arbiter collateral.
     * @param agentId The agent becoming an arbiter.
     */
    function stakeAsArbiter(bytes32 agentId) external payable {
        require(msg.value >= MIN_ARBITER_STAKE, "Below minimum arbiter stake");
        arbiterStakes[agentId] += msg.value;
        totalStaked += msg.value;
        emit ArbiterStaked(agentId, msg.value);
    }

    /**
     * @notice Deposit dispute bond when filing a dispute.
     * @param disputeId Unique dispute identifier.
     * @param disputerId The agent filing the dispute.
     */
    function depositDisputeBond(uint256 disputeId, bytes32 disputerId) external payable onlyOracle {
        require(msg.value >= DISPUTE_BOND_AMOUNT, "Below minimum bond");
        require(disputeBonds[disputeId] == 0, "Bond already deposited");
        disputeBonds[disputeId] = msg.value;
        emit DisputeBondDeposited(disputeId, disputerId, msg.value);
    }

    /**
     * @notice Return dispute bond to disputer (dispute was upheld).
     * @param disputeId The dispute whose bond to return.
     */
    function returnDisputeBond(uint256 disputeId, bytes32 disputerId) external onlyOracle {
        uint256 bond = disputeBonds[disputeId];
        require(bond > 0, "No bond found");
        disputeBonds[disputeId] = 0;
        (bool success, ) = msg.sender.call{value: bond}("");
        require(success, "Transfer failed");
        emit DisputeBondReturned(disputeId, disputerId, bond);
    }

    /**
     * @notice Forfeit dispute bond to accused (dispute was dismissed).
     * @param disputeId The dispute whose bond to forfeit.
     * @param accusedId The agent receiving the forfeited bond.
     */
    function forfeitDisputeBond(uint256 disputeId, bytes32 accusedId) external onlyOracle {
        uint256 bond = disputeBonds[disputeId];
        require(bond > 0, "No bond found");
        disputeBonds[disputeId] = 0;
        // Bond goes to contract balance for redistribution
        emit DisputeBondForfeited(disputeId, accusedId, bond);
    }

    /**
     * @notice Reward an arbiter for participating in dispute resolution.
     * @param arbiterId The arbiter to reward.
     * @param amount The reward amount in tinybar.
     */
    function rewardArbiter(bytes32 arbiterId, uint256 amount) external onlyOracle {
        require(amount > 0, "Zero reward");
        uint256 available = address(this).balance - totalStaked;
        require(amount <= available, "Insufficient funds for reward");
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        emit ArbiterRewarded(arbiterId, amount);
    }

    function getArbiterStake(bytes32 agentId) external view returns (uint256) {
        return arbiterStakes[agentId];
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
