import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('community_users')
export class CommunityUserEntity {
  @PrimaryColumn({ name: 'wallet_address' })
  walletAddress: string; // Hedera account ID e.g. 0.0.12345

  @Column({ name: 'display_name' })
  displayName: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ name: 'created_at', type: 'bigint' })
  createdAt: number;

  @Column({ name: 'feedback_count', default: 0 })
  feedbackCount: number;
}
