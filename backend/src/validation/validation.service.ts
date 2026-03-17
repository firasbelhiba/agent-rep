import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ValidationRequestEntity } from './validation-request.entity';
import { ValidationResponseEntity } from './validation-response.entity';

@Injectable()
export class ValidationService {
  constructor(
    @InjectRepository(ValidationRequestEntity)
    private readonly reqRepo: Repository<ValidationRequestEntity>,
    @InjectRepository(ValidationResponseEntity)
    private readonly respRepo: Repository<ValidationResponseEntity>,
  ) {}

  async findByAgent(agentId: string) {
    const [requests, responses] = await Promise.all([
      this.reqRepo.find({ where: { agentId } }),
      this.respRepo.find({ where: { agentId } }),
    ]);
    return { requests, responses };
  }

  async findByHash(requestHash: string) {
    const [request, responses] = await Promise.all([
      this.reqRepo.findOneBy({ requestHash }),
      this.respRepo.find({ where: { requestHash } }),
    ]);
    return { request, responses };
  }

  async createRequest(data: Partial<ValidationRequestEntity>): Promise<ValidationRequestEntity> {
    const req = this.reqRepo.create(data);
    return this.reqRepo.save(req);
  }

  async createResponse(data: Partial<ValidationResponseEntity>): Promise<ValidationResponseEntity> {
    const resp = this.respRepo.create(data);
    const saved = await this.respRepo.save(resp);

    // Update request status to completed
    await this.reqRepo.update(
      { requestHash: data.requestHash },
      { status: 'completed' },
    );

    return saved;
  }

  async saveResponse(resp: ValidationResponseEntity): Promise<ValidationResponseEntity> {
    return this.respRepo.save(resp);
  }

  async getRecentResponses(limit: number): Promise<ValidationResponseEntity[]> {
    return this.respRepo.find({
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  // ---- ERC-8004 Validation Registry methods ----

  /**
   * ERC-8004: getValidationStatus(requestHash)
   * Returns full status including validator, agent, response, and tag
   */
  async getValidationStatus(requestHash: string): Promise<{
    validatorAddress: string;
    agentId: string;
    response: number;
    responseHash: string | undefined;
    tag: string;
    lastUpdate: number;
  } | null> {
    const request = await this.reqRepo.findOneBy({ requestHash });
    if (!request) return null;

    const latestResponse = await this.respRepo.findOne({
      where: { requestHash },
      order: { timestamp: 'DESC' },
    });

    return {
      validatorAddress: request.validatorId,
      agentId: request.agentId,
      response: latestResponse?.response ?? 0,
      responseHash: latestResponse?.responseHash,
      tag: latestResponse?.tag ?? '',
      lastUpdate: latestResponse?.timestamp ?? request.timestamp,
    };
  }

  /**
   * ERC-8004: getSummary(agentId, validatorAddresses[], tag)
   * Returns { count, averageResponse }
   */
  async getValidationSummary(
    agentId: string,
    validatorAddresses?: string[],
    tag?: string,
  ): Promise<{ count: number; averageResponse: number }> {
    const qb = this.respRepo
      .createQueryBuilder('r')
      .where('r.agentId = :agentId', { agentId });

    if (validatorAddresses && validatorAddresses.length > 0) {
      qb.andWhere('r.validatorId IN (:...validators)', { validators: validatorAddresses });
    }
    if (tag) {
      qb.andWhere('r.tag = :tag', { tag });
    }

    const responses = await qb.getMany();

    if (responses.length === 0) {
      return { count: 0, averageResponse: 0 };
    }

    const sum = responses.reduce((s, r) => s + Number(r.response), 0);
    return {
      count: responses.length,
      averageResponse: Math.round(sum / responses.length),
    };
  }

  /**
   * ERC-8004: getAgentValidations(agentId) — all request hashes for an agent
   */
  async getAgentValidations(agentId: string): Promise<string[]> {
    const requests = await this.reqRepo.find({ where: { agentId } });
    return requests.map((r) => r.requestHash);
  }

  /**
   * ERC-8004: getValidatorRequests(validatorAddress) — all request hashes by a validator
   */
  async getValidatorRequests(validatorAddress: string): Promise<string[]> {
    const requests = await this.reqRepo.find({ where: { validatorId: validatorAddress } });
    return requests.map((r) => r.requestHash);
  }
}
