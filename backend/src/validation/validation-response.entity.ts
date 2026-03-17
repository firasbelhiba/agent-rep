import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('validation_responses')
export class ValidationResponseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'request_hash' })
  requestHash: string;

  @Column({ name: 'validator_id' })
  validatorId: string;

  @Column({ name: 'agent_id' })
  agentId: string;

  @Column({ type: 'int' })
  response: number;

  @Column({ name: 'response_uri', nullable: true })
  responseURI?: string;

  @Column({ name: 'response_hash', nullable: true })
  responseHash?: string;

  @Column()
  tag: string;

  @Column({ type: 'bigint' })
  timestamp: number;

  @Column({ name: 'hcs_sequence_number', nullable: true })
  hcsSequenceNumber?: string;
}
