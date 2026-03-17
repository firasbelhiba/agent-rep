import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { FeedbackEntity } from './feedback.entity';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(FeedbackEntity)
    private readonly repo: Repository<FeedbackEntity>,
  ) {}

  async findAll(agentId?: string, tag1?: string): Promise<FeedbackEntity[]> {
    const where: any = { isRevoked: false };
    if (agentId) where.agentId = agentId;
    if (tag1) where.tag1 = tag1;
    return this.repo.find({ where });
  }

  async findByAgent(id: string): Promise<FeedbackEntity[]> {
    return this.repo.find({ where: { agentId: id, isRevoked: false } });
  }

  async findById(feedbackId: string): Promise<FeedbackEntity | null> {
    return this.repo.findOneBy({ feedbackId });
  }

  async create(data: Partial<FeedbackEntity>): Promise<FeedbackEntity> {
    const fb = this.repo.create(data);
    return this.repo.save(fb);
  }

  async findExisting(fromAgentId: string, agentId: string, tag1: string): Promise<FeedbackEntity | null> {
    return this.repo.findOne({
      where: { fromAgentId, agentId, tag1, isRevoked: false },
    });
  }

  async revoke(feedbackId: string, fromAgentId: string): Promise<boolean> {
    const fb = await this.repo.findOneBy({ feedbackId, fromAgentId });
    if (!fb) return false;
    fb.isRevoked = true;
    await this.repo.save(fb);
    return true;
  }

  async appendResponse(
    feedbackId: string,
    agentId: string,
    responseURI: string,
    responseHash?: string,
  ): Promise<boolean> {
    const fb = await this.repo.findOneBy({ feedbackId, agentId });
    if (!fb) return false;
    fb.responseURI = responseURI;
    fb.responseHash = responseHash;
    await this.repo.save(fb);
    return true;
  }

  async getRecentFeedback(limit: number): Promise<FeedbackEntity[]> {
    return this.repo.find({
      where: { isRevoked: false },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  // ---- ERC-8004 Reputation Registry methods ----

  /**
   * Get the next sequential feedbackIndex for an agent.
   * Maps to Solidity's array-based indexing: each agent has feedback[0], feedback[1], etc.
   */
  async getNextFeedbackIndex(agentId: string): Promise<number> {
    const result = await this.repo
      .createQueryBuilder('f')
      .select('MAX(f.feedbackIndex)', 'maxIndex')
      .where('f.agentId = :agentId', { agentId })
      .getRawOne();
    return (result?.maxIndex ?? -1) + 1;
  }

  /**
   * ERC-8004: readFeedback(agentId, clientAddress, feedbackIndex)
   */
  async findByIndex(agentId: string, clientAddress: string, feedbackIndex: number): Promise<FeedbackEntity | null> {
    return this.repo.findOne({
      where: { agentId, fromAgentId: clientAddress, feedbackIndex },
    });
  }

  /**
   * ERC-8004: readAllFeedback(agentId, clientAddresses[], tag1, tag2, includeRevoked)
   */
  async readAllFeedback(
    agentId: string,
    clientAddresses?: string[],
    tag1?: string,
    tag2?: string,
    includeRevoked = false,
  ): Promise<FeedbackEntity[]> {
    const qb = this.repo.createQueryBuilder('f').where('f.agentId = :agentId', { agentId });

    if (!includeRevoked) {
      qb.andWhere('f.isRevoked = :revoked', { revoked: false });
    }
    if (clientAddresses && clientAddresses.length > 0) {
      qb.andWhere('f.fromAgentId IN (:...clients)', { clients: clientAddresses });
    }
    if (tag1) {
      qb.andWhere('f.tag1 = :tag1', { tag1 });
    }
    if (tag2) {
      qb.andWhere('f.tag2 = :tag2', { tag2 });
    }

    return qb.orderBy('f.feedbackIndex', 'ASC').getMany();
  }

  /**
   * ERC-8004: getSummary(agentId, clientAddresses[], tag1, tag2)
   * Returns { count, summaryValue, summaryValueDecimals }
   */
  async getSummary(
    agentId: string,
    clientAddresses?: string[],
    tag1?: string,
    tag2?: string,
  ): Promise<{ count: number; summaryValue: number; summaryValueDecimals: number }> {
    const feedback = await this.readAllFeedback(agentId, clientAddresses, tag1, tag2, false);

    if (feedback.length === 0) {
      return { count: 0, summaryValue: 0, summaryValueDecimals: 0 };
    }

    // Normalize all values to the highest precision (max valueDecimals)
    const maxDecimals = Math.max(...feedback.map((f) => f.valueDecimals || 0));
    let sum = 0;
    for (const f of feedback) {
      const scale = Math.pow(10, maxDecimals - (f.valueDecimals || 0));
      sum += f.value * scale;
    }

    return {
      count: feedback.length,
      summaryValue: sum,
      summaryValueDecimals: maxDecimals,
    };
  }

  /**
   * ERC-8004: getClients(agentId) — returns all unique client addresses that gave feedback
   */
  async getClients(agentId: string): Promise<string[]> {
    const results = await this.repo
      .createQueryBuilder('f')
      .select('DISTINCT f.fromAgentId', 'client')
      .where('f.agentId = :agentId', { agentId })
      .andWhere('f.isRevoked = :revoked', { revoked: false })
      .getRawMany();
    return results.map((r) => r.client);
  }

  /**
   * ERC-8004: getLastIndex(agentId, clientAddress)
   */
  async getLastIndex(agentId: string, clientAddress: string): Promise<number> {
    const result = await this.repo
      .createQueryBuilder('f')
      .select('MAX(f.feedbackIndex)', 'maxIndex')
      .where('f.agentId = :agentId', { agentId })
      .andWhere('f.fromAgentId = :clientAddress', { clientAddress })
      .getRawOne();
    return result?.maxIndex ?? -1;
  }

  /**
   * ERC-8004: revokeFeedback by agentId + feedbackIndex (alternative to UUID)
   */
  async revokeByIndex(agentId: string, feedbackIndex: number, fromAgentId: string): Promise<boolean> {
    const fb = await this.repo.findOne({
      where: { agentId, feedbackIndex, fromAgentId },
    });
    if (!fb) return false;
    fb.isRevoked = true;
    await this.repo.save(fb);
    return true;
  }
}
