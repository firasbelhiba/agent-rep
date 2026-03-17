import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('disputes')
export class DisputeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  // The feedback being disputed
  @Column({ name: 'feedback_id' })
  feedbackId: string;

  // Agent who filed the dispute (the one who received the feedback)
  @Column({ name: 'disputer_id' })
  disputerId: string;

  // Agent whose feedback is being disputed (the one who gave it)
  @Column({ name: 'accused_id' })
  accusedId: string;

  // Reason for the dispute
  @Column({ type: 'text' })
  reason: string;

  // 'pending' | 'upheld' (slash applied) | 'dismissed'
  @Column({ default: 'pending' })
  status: string;

  // Who resolved the dispute (another agent acting as arbiter)
  @Column({ name: 'resolved_by', nullable: true })
  resolvedBy?: string;

  // Resolution notes
  @Column({ name: 'resolution_notes', nullable: true })
  resolutionNotes?: string;

  // Amount slashed (if upheld)
  @Column({ name: 'slash_amount', type: 'bigint', default: 0 })
  slashAmount: number;

  @Column({ name: 'created_at', type: 'bigint' })
  createdAt: number;

  @Column({ name: 'resolved_at', type: 'bigint', nullable: true })
  resolvedAt?: number;

  @Column({ name: 'hcs_sequence_number', nullable: true })
  hcsSequenceNumber?: string;
}
