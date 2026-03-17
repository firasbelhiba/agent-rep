import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentEntity } from './agent.entity';

@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(AgentEntity)
    private readonly repo: Repository<AgentEntity>,
  ) {}

  async findAll(skill?: string): Promise<AgentEntity[]> {
    const agents = await this.repo.find();
    if (skill) {
      return agents.filter((a) =>
        a.skills.some((s) => s.toLowerCase() === skill.toLowerCase()),
      );
    }
    return agents;
  }

  async findByOwner(walletAddress: string): Promise<AgentEntity[]> {
    return this.repo.find({ where: { createdByWallet: walletAddress } });
  }

  async findOne(agentId: string): Promise<AgentEntity | null> {
    return this.repo.findOneBy({ agentId });
  }

  async findByApiKeyHash(apiKeyHash: string): Promise<AgentEntity | null> {
    return this.repo.findOneBy({ apiKeyHash });
  }

  async create(data: Partial<AgentEntity>): Promise<AgentEntity> {
    const agent = this.repo.create(data);
    return this.repo.save(agent);
  }

  async update(agentId: string, data: Partial<AgentEntity>): Promise<AgentEntity | null> {
    const agent = await this.repo.findOneBy({ agentId });
    if (!agent) return null;
    Object.assign(agent, data);
    return this.repo.save(agent);
  }

  // ERC-8004 Identity Registry: setAgentURI
  async updateAgentURI(agentId: string, newURI: string): Promise<AgentEntity | null> {
    return this.update(agentId, { agentURI: newURI });
  }

  // ERC-8004 Identity Registry: setAgentWallet / getAgentWallet
  async setAgentWallet(agentId: string, wallet: string): Promise<AgentEntity | null> {
    return this.update(agentId, { agentWallet: wallet });
  }

  async getAgentWallet(agentId: string): Promise<string | null> {
    const agent = await this.repo.findOneBy({ agentId });
    return agent?.agentWallet || null;
  }

  // ERC-8004 Identity Registry: getMetadata(key) / setMetadata(key, value)
  async getMetadataByKey(agentId: string, key: string): Promise<unknown> {
    const agent = await this.repo.findOneBy({ agentId });
    if (!agent) return null;
    return agent.metadata?.[key] ?? null;
  }

  async setMetadataByKey(agentId: string, key: string, value: unknown): Promise<AgentEntity | null> {
    const agent = await this.repo.findOneBy({ agentId });
    if (!agent) return null;
    const metadata = { ...agent.metadata, [key]: value };
    return this.update(agentId, { metadata });
  }

  /**
   * Deduct operating balance (in tinybars) from an agent.
   * Returns false if insufficient balance.
   */
  async deductBalance(agentId: string, amountTinybars: number): Promise<boolean> {
    const agent = await this.repo.findOneBy({ agentId });
    if (!agent) return false;
    const current = Number(agent.operatingBalance) || 0;
    if (current < amountTinybars) return false;
    agent.operatingBalance = current - amountTinybars;
    await this.repo.save(agent);
    return true;
  }

  /**
   * Check if agent has sufficient operating balance.
   */
  async hasBalance(agentId: string, amountTinybars: number): Promise<boolean> {
    const agent = await this.repo.findOneBy({ agentId });
    if (!agent) return false;
    return (Number(agent.operatingBalance) || 0) >= amountTinybars;
  }

  /**
   * Add to operating balance (for top-ups).
   */
  async addBalance(agentId: string, amountTinybars: number): Promise<AgentEntity | null> {
    const agent = await this.repo.findOneBy({ agentId });
    if (!agent) return null;
    agent.operatingBalance = (Number(agent.operatingBalance) || 0) + amountTinybars;
    return this.repo.save(agent);
  }
}
