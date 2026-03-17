import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HCS10Service } from './hcs10.service';
import { ConnectionEntity } from './connection.entity';
import { AgentsService } from '../agents/agents.service';

@Controller('connections')
export class ConnectionsController {
  constructor(
    private readonly hcs10Service: HCS10Service,
    private readonly agentsService: AgentsService,
    @InjectRepository(ConnectionEntity)
    private readonly connectionRepo: Repository<ConnectionEntity>,
  ) {}

  /**
   * GET /api/connections/:agentId/active-peers — Get agents with active connections.
   */
  @Get(':agentId/active-peers')
  async getActivePeers(@Param('agentId') agentId: string) {
    const connections = await this.connectionRepo.find({
      where: [
        { fromAgentId: agentId, status: 'active' },
        { toAgentId: agentId, status: 'active' },
      ],
    });

    const peerIds = [...new Set(connections.map(c =>
      c.fromAgentId === agentId ? c.toAgentId : c.fromAgentId
    ))];

    const peers = await Promise.all(
      peerIds.map(id => this.agentsService.findOne(id))
    );

    return { peers: peers.filter(Boolean) };
  }

  /**
   * GET /api/connections/:agentId — List all connections for an agent.
   */
  @Get(':agentId')
  async getConnections(@Param('agentId') agentId: string) {
    const connections = await this.connectionRepo.find({
      where: [{ fromAgentId: agentId }, { toAgentId: agentId }],
    });

    return { connections };
  }

  /**
   * POST /api/connections/seed — Create a direct active connection (for seeding/demo only).
   */
  @Post('seed')
  async seedConnection(
    @Body() body: { fromAgentId: string; toAgentId: string },
  ) {
    const { fromAgentId, toAgentId } = body;
    if (!fromAgentId || !toAgentId) {
      throw new HttpException('fromAgentId and toAgentId are required', HttpStatus.BAD_REQUEST);
    }
    const connection = this.connectionRepo.create({
      fromAgentId,
      toAgentId,
      connectionTopicId: `seed-${Date.now()}`,
      status: 'active',
      createdAt: Date.now(),
    });
    await this.connectionRepo.save(connection);
    return { connection, success: true };
  }

  /**
   * POST /api/connections/request — Initiate a connection to another agent.
   */
  @Post('request')
  @Throttle({ default: { ttl: 3600000, limit: 20 } })
  async requestConnection(
    @Body() body: { fromAgentId: string; toAgentId: string },
  ) {
    const { fromAgentId, toAgentId } = body;

    if (!fromAgentId || !toAgentId) {
      throw new HttpException('fromAgentId and toAgentId are required', HttpStatus.BAD_REQUEST);
    }

    const toAgent = await this.agentsService.findOne(toAgentId);
    if (!toAgent) {
      throw new HttpException('Target agent not found', HttpStatus.NOT_FOUND);
    }

    if (!toAgent.inboundTopicId) {
      throw new HttpException(
        'Target agent does not have an HCS-10 inbound topic',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.hcs10Service.initiateConnection(toAgent.inboundTopicId);

    if (!result.success) {
      throw new HttpException(
        `Connection request failed: ${result.error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const connection = this.connectionRepo.create({
      fromAgentId,
      toAgentId,
      connectionRequestId: result.connectionRequestId,
      status: 'pending',
      createdAt: Date.now(),
    });
    await this.connectionRepo.save(connection);

    return { connection, success: true };
  }

  /**
   * POST /api/connections/accept — Accept an incoming connection request.
   */
  @Post('accept')
  @Throttle({ default: { ttl: 3600000, limit: 20 } })
  async acceptConnection(
    @Body()
    body: {
      agentId: string;
      requestingAccountId: string;
      connectionRequestId: number;
    },
  ) {
    const { agentId, requestingAccountId, connectionRequestId } = body;

    const agent = await this.agentsService.findOne(agentId);
    if (!agent) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }

    if (!agent.inboundTopicId) {
      throw new HttpException(
        'Agent does not have an HCS-10 inbound topic',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.hcs10Service.acceptConnection(
      agent.inboundTopicId,
      requestingAccountId,
      connectionRequestId,
    );

    if (!result.success) {
      throw new HttpException(
        `Connection acceptance failed: ${result.error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Update connection record
    const connection = await this.connectionRepo.findOne({
      where: { toAgentId: agentId, connectionRequestId },
    });
    if (connection) {
      connection.connectionTopicId = result.connectionTopicId;
      connection.status = 'active';
      await this.connectionRepo.save(connection);
    }

    return { connectionTopicId: result.connectionTopicId, success: true };
  }

  /**
   * POST /api/connections/message — Send a message on a connection topic.
   */
  @Post('message')
  @Throttle({ default: { ttl: 3600000, limit: 20 } })
  async sendMessage(
    @Body() body: { connectionTopicId: string; message: string; memo?: string },
  ) {
    const { connectionTopicId, message, memo } = body;

    if (!connectionTopicId || !message) {
      throw new HttpException(
        'connectionTopicId and message are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const success = await this.hcs10Service.sendMessage(connectionTopicId, message, memo);

    if (!success) {
      throw new HttpException('Failed to send message', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return { success: true };
  }

  /**
   * GET /api/connections/messages/:topicId — Get messages from a connection topic.
   */
  @Get('messages/:topicId')
  async getMessages(@Param('topicId') topicId: string) {
    const messages = await this.hcs10Service.getTopicMessages(topicId);
    return { messages };
  }
}
