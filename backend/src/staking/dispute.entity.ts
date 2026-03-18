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

  // 'pending' | 'voting' | 'upheld' | 'dismissed'
  @Column({ default: 'pending' })
  status: string;

  // Dispute bond amount in tinybars (2 HBAR = 200_000_000)
  @Column({ name: 'bond_amount', type: 'bigint', default: 200_000_000 })
  bondAmount: number;

  // Selected arbiter agent IDs (JSON array of 3)
  @Column({ name: 'selected_arbiters', type: 'text', nullable: true })
  selectedArbiters?: string; // JSON: ["agentId1", "agentId2", "agentId3"]

  // Arbiter votes (JSON object)
  @Column({ name: 'arbiter_votes', type: 'text', nullable: true })
  arbiterVotes?: string; // JSON: { "agentId1": { "vote": "upheld", "reasoning": "...", "timestamp": 123 } }

  // Deadline for arbiter responses (48h from creation)
  @Column({ name: 'voting_deadline', type: 'bigint', nullable: true })
  votingDeadline?: number;

  // Who resolved the dispute (system after majority vote)
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

  // Helper methods
  getSelectedArbiters(): string[] {
    return this.selectedArbiters ? JSON.parse(this.selectedArbiters) : [];
  }

  getArbiterVotes(): Record<string, { vote: string; reasoning: string; timestamp: number }> {
    return this.arbiterVotes ? JSON.parse(this.arbiterVotes) : {};
  }

  setSelectedArbiters(arbiters: string[]) {
    this.selectedArbiters = JSON.stringify(arbiters);
  }

  setArbiterVote(arbiterId: string, vote: string, reasoning: string) {
    const votes = this.getArbiterVotes();
    votes[arbiterId] = { vote, reasoning, timestamp: Date.now() };
    this.arbiterVotes = JSON.stringify(votes);
  }
}
