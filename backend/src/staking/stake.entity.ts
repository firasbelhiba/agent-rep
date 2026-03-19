import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('stakes')
export class StakeEntity {
  @PrimaryColumn({ name: 'agent_id' })
  agentId: string;

  // Current staked balance (in tinybars, 1 HBAR = 100_000_000 tinybars)
  @Column({ type: 'bigint', default: 0 })
  balance: number;

  // Total deposited over lifetime
  @Column({ name: 'total_deposited', type: 'bigint', default: 0 })
  totalDeposited: number;

  // Total slashed over lifetime
  @Column({ name: 'total_slashed', type: 'bigint', default: 0 })
  totalSlashed: number;

  // Number of times this agent's feedback was disputed and slashed
  @Column({ name: 'slash_count', type: 'int', default: 0 })
  slashCount: number;

  @Column({ name: 'last_deposit_at', type: 'bigint', nullable: true })
  lastDepositAt?: number;

  @Column({ name: 'last_slash_at', type: 'bigint', nullable: true })
  lastSlashAt?: number;

  // Last Hedera transaction ID from the staking contract
  @Column({ name: 'contract_tx_id', nullable: true })
  contractTxId?: string;

  // ---- Arbiter fields ----

  // Whether this agent is eligible to serve as arbiter
  @Column({ name: 'arbiter_eligible', default: false })
  arbiterEligible: boolean;

  // Additional arbiter stake (on top of regular stake)
  @Column({ name: 'arbiter_stake', type: 'bigint', default: 0 })
  arbiterStake: number;

  // Total disputes resolved as arbiter
  @Column({ name: 'arbitrations_resolved', type: 'int', default: 0 })
  arbitrationsResolved: number;

  // How often this arbiter voted with the majority (0-100%)
  @Column({ name: 'majority_rate', type: 'float', default: 0 })
  majorityRate: number;

  // Total majority and minority votes (for computing rate)
  @Column({ name: 'majority_votes', type: 'int', default: 0 })
  majorityVotes: number;

  @Column({ name: 'minority_votes', type: 'int', default: 0 })
  minorityVotes: number;

  // ---- Validator accountability fields ----

  // Times this agent validated feedback that was later disputed and upheld (bad validation)
  @Column({ name: 'validation_penalties', type: 'int', default: 0 })
  validationPenalties: number;

  // Times this agent correctly flagged bad feedback before a dispute
  @Column({ name: 'validation_rewards', type: 'int', default: 0 })
  validationRewards: number;
}
