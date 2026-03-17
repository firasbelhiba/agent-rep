import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('connections')
export class ConnectionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'from_agent_id' })
  fromAgentId: string;

  @Column({ name: 'to_agent_id' })
  toAgentId: string;

  @Column({ name: 'connection_topic_id', nullable: true })
  connectionTopicId?: string;

  @Column({ name: 'connection_request_id', nullable: true, type: 'int' })
  connectionRequestId?: number;

  @Column({ default: 'pending' })
  status: string; // pending | active | closed

  @Column({ name: 'created_at', type: 'bigint' })
  createdAt: number;
}
