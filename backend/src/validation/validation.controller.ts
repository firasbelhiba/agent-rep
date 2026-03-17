import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ValidationService } from './validation.service';
import { AgentsService } from '../agents/agents.service';
import { ReputationService } from '../reputation/reputation.service';
import { HCSService, HCSMessageType } from '../hedera/hcs.service';
import { HederaConfigService } from '../hedera/hedera-config.service';
import { SystemConfigService } from '../config/system-config.service';
import { ConnectionEntity } from '../hedera/connection.entity';

@Controller('validation')
export class ValidationController {
  private readonly logger = new Logger(ValidationController.name);

  constructor(
    private readonly validationService: ValidationService,
    private readonly agentsService: AgentsService,
    private readonly reputationService: ReputationService,
    private readonly hcsService: HCSService,
    private readonly hederaConfig: HederaConfigService,
    private readonly systemConfig: SystemConfigService,
    @InjectRepository(ConnectionEntity)
    private readonly connectionRepo: Repository<ConnectionEntity>,
  ) {}

  private async authenticateAgent(apiKey: string | undefined) {
    if (!apiKey) {
      throw new HttpException(
        'Missing X-Agent-Key header. Agents must authenticate with their API key.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const agent = await this.agentsService.findByApiKeyHash(keyHash);
    if (!agent) {
      throw new HttpException('Invalid API key', HttpStatus.UNAUTHORIZED);
    }
    return agent;
  }

  @Get()
  async find(
    @Query('agentId') agentId?: string,
    @Query('requestHash') requestHash?: string,
  ) {
    if (requestHash) {
      const result = await this.validationService.findByHash(requestHash);
      if (!result.request) {
        throw new HttpException('Validation request not found', HttpStatus.NOT_FOUND);
      }
      return { request: result.request, responses: result.responses };
    }

    if (agentId) {
      const result = await this.validationService.findByAgent(agentId);
      return { requests: result.requests, responses: result.responses };
    }

    throw new HttpException(
      'agentId or requestHash query parameter is required',
      HttpStatus.BAD_REQUEST,
    );
  }

  // ---- ERC-8004 Validation Registry: getValidationStatus(requestHash) ----
  @Get('status/:requestHash')
  async getValidationStatus(@Param('requestHash') requestHash: string) {
    const status = await this.validationService.getValidationStatus(requestHash);
    if (!status) {
      throw new HttpException('Validation request not found', HttpStatus.NOT_FOUND);
    }
    return status;
  }

  // ---- ERC-8004 Validation Registry: getSummary(agentId, validatorAddresses[], tag) ----
  @Get(':agentId/summary')
  async getValidationSummary(
    @Param('agentId') agentId: string,
    @Query('validatorAddresses') validatorAddressesStr?: string,
    @Query('tag') tag?: string,
  ) {
    const agent = await this.agentsService.findOne(agentId);
    if (!agent) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }

    const validatorAddresses = validatorAddressesStr
      ? validatorAddressesStr.split(',').map((s) => s.trim())
      : undefined;

    return this.validationService.getValidationSummary(agentId, validatorAddresses, tag);
  }

  // ---- ERC-8004 Validation Registry: getAgentValidations(agentId) ----
  @Get(':agentId/hashes')
  async getAgentValidations(@Param('agentId') agentId: string) {
    const hashes = await this.validationService.getAgentValidations(agentId);
    return { requestHashes: hashes };
  }

  // ---- ERC-8004 Validation Registry: getValidatorRequests(validatorAddress) ----
  @Get('validator/:validatorId/hashes')
  async getValidatorRequests(@Param('validatorId') validatorId: string) {
    const hashes = await this.validationService.getValidatorRequests(validatorId);
    return { requestHashes: hashes };
  }

  /**
   * ERC-8004 Validation Registry: validationRequest(validatorAddress, agentId, requestURI, requestHash)
   * Now accepts optional requestHash from caller (ERC-8004 pattern).
   */
  @Post()
  @Throttle({ default: { ttl: 3600000, limit: 20 } })
  async createRequest(
    @Headers('x-agent-key') apiKey: string | undefined,
    @Body() body: any,
  ) {
    const validator = await this.authenticateAgent(apiKey);
    const validatorId = validator.agentId;

    const { agentId, requestURI, requestHash: suppliedRequestHash } = body;

    if (!agentId || !requestURI) {
      throw new HttpException(
        'agentId and requestURI are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const agent = await this.agentsService.findOne(agentId);
    if (!agent) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }

    // Verify active connection
    const activeConnection = await this.connectionRepo.findOne({
      where: [
        { fromAgentId: validatorId, toAgentId: agentId, status: 'active' },
        { fromAgentId: agentId, toAgentId: validatorId, status: 'active' },
      ],
    });
    if (!activeConnection) {
      throw new HttpException(
        'No active HCS-10 connection between your agent and the target agent.',
        HttpStatus.FORBIDDEN,
      );
    }

    // ERC-8004: accept caller-supplied requestHash, or generate one
    const requestHash = suppliedRequestHash || crypto
      .createHash('sha256')
      .update(agentId + requestURI + Date.now())
      .digest('hex');

    const saved = await this.validationService.createRequest({
      requestHash,
      agentId,
      validatorId,
      requestURI,
      status: 'pending',
      timestamp: Date.now(),
    });

    // Log ERC-8004 ValidationRequest event to HCS
    let hcsSequenceNumber: string | undefined;
    if (this.hederaConfig.isConfigured()) {
      const topics = await this.systemConfig.getHCSTopics();
      if (topics.validation) {
        try {
          hcsSequenceNumber = await this.hcsService.logInteraction(
            topics.validation,
            HCSMessageType.VALIDATION_REQUESTED,
            {
              validatorAddress: validatorId,
              agentId,
              requestURI,
              requestHash,
            },
          );
          saved.hcsSequenceNumber = hcsSequenceNumber;
        } catch (e) {
          this.logger.warn('Failed to log validation request to HCS', e);
        }
      }
    }

    return { request: saved, hcsSequenceNumber };
  }

  /**
   * ERC-8004 Validation Registry: validationResponse(requestHash, response, responseURI, responseHash, tag)
   * Now logs response to HCS (was missing before).
   */
  @Post('respond')
  async respond(
    @Headers('x-agent-key') apiKey: string | undefined,
    @Body() body: any,
  ) {
    const validator = await this.authenticateAgent(apiKey);

    const { requestHash, response, responseURI, responseHash, tag } = body;

    if (!requestHash || response === undefined || !tag) {
      throw new HttpException(
        'requestHash, response, and tag are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (response < 0 || response > 100) {
      throw new HttpException('response must be between 0 and 100', HttpStatus.BAD_REQUEST);
    }

    const existing = await this.validationService.findByHash(requestHash);
    if (!existing.request) {
      throw new HttpException('Validation request not found', HttpStatus.NOT_FOUND);
    }

    if (existing.request.validatorId !== validator.agentId) {
      throw new HttpException(
        'You are not the assigned validator for this request',
        HttpStatus.FORBIDDEN,
      );
    }

    const saved = await this.validationService.createResponse({
      requestHash,
      validatorId: validator.agentId,
      agentId: existing.request.agentId,
      response: Number(response),
      responseURI,
      responseHash,
      tag,
      timestamp: Date.now(),
    });

    // Log ERC-8004 ValidationResponse event to HCS
    let hcsSequenceNumber: string | undefined;
    if (this.hederaConfig.isConfigured()) {
      const topics = await this.systemConfig.getHCSTopics();
      if (topics.validation) {
        try {
          hcsSequenceNumber = await this.hcsService.logInteraction(
            topics.validation,
            HCSMessageType.VALIDATION_RESPONDED,
            {
              validatorAddress: validator.agentId,
              agentId: existing.request.agentId,
              requestHash,
              response: Number(response),
              responseURI: responseURI || '',
              responseHash: responseHash || '',
              tag,
            },
          );
          saved.hcsSequenceNumber = hcsSequenceNumber;
          await this.validationService.saveResponse(saved);
        } catch (e) {
          this.logger.warn('Failed to log validation response to HCS', e);
        }
      }
    }

    const reputation = await this.reputationService.computeReputation(existing.request.agentId);

    return { validationResponse: saved, reputation, hcsSequenceNumber };
  }
}
