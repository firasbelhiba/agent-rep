import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('validation_requests')
export class ValidationRequestEntity {
  @PrimaryColumn({ name: 'request_hash' })
  requestHash: string;

  @Column({ name: 'agent_id' })
  agentId: string;

  @Column({ name: 'validator_id' })
  validatorId: string;

  @Column({ name: 'request_uri' })
  requestURI: string;

  @Column({ default: 'pending' })
  status: string;

  @Column({ type: 'bigint' })
  timestamp: number;

  @Column({ name: 'hcs_sequence_number', nullable: true })
  hcsSequenceNumber?: string;
}
