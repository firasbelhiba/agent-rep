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
}
