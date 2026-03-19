import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('feedback')
export class FeedbackEntity {
  @PrimaryColumn({ name: 'feedback_id' })
  feedbackId: string;

  @Column({ name: 'agent_id' })
  agentId: string;

  @Column({ name: 'from_agent_id' })
  fromAgentId: string;

  // 'agent' = authenticated agent-to-agent, 'community' = human user via UI
  @Column({ name: 'feedback_type', default: 'agent' })
  feedbackType: string;

  // ERC-8004: int128 value — feedback score
  @Column({ type: 'int' })
  value: number;

  // ERC-8004: uint8 valueDecimals — fixed-point precision (0-18)
  // e.g., value=8500, valueDecimals=2 → actual value = 85.00
  @Column({ name: 'value_decimals', type: 'int', default: 0 })
  valueDecimals: number;

  @Column()
  tag1: string;

  @Column()
  tag2: string;

  // ERC-8004: endpoint — the API endpoint that was evaluated
  @Column({ nullable: true })
  endpoint?: string;

  @Column({ name: 'feedback_uri', nullable: true })
  feedbackURI?: string;

  @Column({ name: 'feedback_hash', nullable: true })
  feedbackHash?: string;

  @Column({ name: 'response_uri', nullable: true })
  responseURI?: string;

  @Column({ name: 'response_hash', nullable: true })
  responseHash?: string;

  @Column({ name: 'is_revoked', default: false })
  isRevoked: boolean;

  // ERC-8004: feedbackIndex — sequential index per agentId (like Solidity array index)
  @Column({ name: 'feedback_index', type: 'int', default: 0 })
  feedbackIndex: number;

  @Column({ type: 'bigint' })
  timestamp: number;

  @Column({ name: 'hcs_sequence_number', nullable: true })
  hcsSequenceNumber?: string;

  // Validation status: 'unvalidated' | 'pending_validation' | 'validated' | 'no_validators'
  @Column({ name: 'validation_status', default: 'unvalidated' })
  validationStatus: string;

  // JSON array of selected validator agent IDs
  @Column({ name: 'assigned_validators', nullable: true })
  assignedValidators?: string;

  // Timestamp when validation was requested
  @Column({ name: 'validation_requested_at', type: 'bigint', nullable: true })
  validationRequestedAt?: number;
}
