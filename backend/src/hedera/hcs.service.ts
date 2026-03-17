import { Injectable, Logger } from '@nestjs/common';
import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicId,
} from '@hashgraph/sdk';
import { HederaConfigService } from './hedera-config.service';

/**
 * HCS Message Types — aligned with ERC-8004 events.
 *
 * Identity Registry events:
 *   AGENT_REGISTERED  → ERC-8004 Registered(agentId, agentURI, owner)
 *   URI_UPDATED       → ERC-8004 URIUpdated(agentId, newURI, updatedBy)
 *   METADATA_SET      → ERC-8004 MetadataSet(agentId, metadataKey, metadataValue)
 *   WALLET_SET        → ERC-8004 setAgentWallet(agentId, wallet)
 *
 * Reputation Registry events:
 *   FEEDBACK_SUBMITTED  → ERC-8004 NewFeedback(agentId, clientAddress, feedbackIndex, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash)
 *   FEEDBACK_REVOKED    → ERC-8004 FeedbackRevoked(agentId, clientAddress, feedbackIndex)
 *   FEEDBACK_RESPONSE   → ERC-8004 ResponseAppended(agentId, clientAddress, feedbackIndex, responder, responseURI, responseHash)
 *
 * Validation Registry events:
 *   VALIDATION_REQUESTED → ERC-8004 ValidationRequest(validatorAddress, agentId, requestURI, requestHash)
 *   VALIDATION_RESPONDED → ERC-8004 ValidationResponse(validatorAddress, agentId, requestHash, response, responseURI, responseHash, tag)
 *
 * AgentRep-specific:
 *   STAKE_DEPOSITED
 *   TIER_UPGRADED
 */
export enum HCSMessageType {
  // Identity Registry (ERC-8004)
  AGENT_REGISTERED = 'AGENT_REGISTERED',
  URI_UPDATED = 'URI_UPDATED',
  METADATA_SET = 'METADATA_SET',
  WALLET_SET = 'WALLET_SET',

  // Reputation Registry (ERC-8004)
  FEEDBACK_SUBMITTED = 'FEEDBACK_SUBMITTED',
  FEEDBACK_REVOKED = 'FEEDBACK_REVOKED',
  FEEDBACK_RESPONSE = 'FEEDBACK_RESPONSE',

  // Validation Registry (ERC-8004)
  VALIDATION_REQUESTED = 'VALIDATION_REQUESTED',
  VALIDATION_RESPONDED = 'VALIDATION_RESPONDED',

  // AgentRep extensions
  STAKE_DEPOSITED = 'STAKE_DEPOSITED',
  STAKE_SLASHED = 'STAKE_SLASHED',
  DISPUTE_FILED = 'DISPUTE_FILED',
  DISPUTE_RESOLVED = 'DISPUTE_RESOLVED',
  TIER_UPGRADED = 'TIER_UPGRADED',
}

export interface HCSReputationMessage {
  type: HCSMessageType;
  timestamp: number;
  data: Record<string, unknown>;
  signature?: string;
}

@Injectable()
export class HCSService {
  private readonly logger = new Logger(HCSService.name);

  constructor(private readonly hederaConfig: HederaConfigService) {}

  async createTopic(memo: string): Promise<string> {
    const client = this.hederaConfig.getClient();
    const transaction = new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setSubmitKey(client.operatorPublicKey!);

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);
    const topicId = receipt.topicId!.toString();

    this.logger.log(`Created topic: ${topicId} (${memo})`);
    return topicId;
  }

  async logInteraction(
    topicId: string,
    type: HCSMessageType,
    data: Record<string, unknown>,
  ): Promise<string> {
    const client = this.hederaConfig.getClient();
    const message: HCSReputationMessage = {
      type,
      timestamp: Date.now(),
      data,
    };

    const response = await new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicId))
      .setMessage(JSON.stringify(message))
      .execute(client);

    const receipt = await response.getReceipt(client);
    const sequenceNumber = receipt.topicSequenceNumber!.toString();

    this.logger.log(`Message logged to ${topicId} | Type: ${type} | Seq: ${sequenceNumber}`);
    return sequenceNumber;
  }

  async getTopicMessages(topicId: string, limit = 100): Promise<HCSReputationMessage[]> {
    const mirrorUrl = this.hederaConfig.getMirrorNodeUrl();
    const url = `${mirrorUrl}/api/v1/topics/${topicId}/messages?limit=${limit}&order=desc`;

    const response = await fetch(url);
    const json = await response.json();

    if (!json.messages) return [];

    return json.messages.map((msg: { message: string }) => {
      const decoded = Buffer.from(msg.message, 'base64').toString('utf-8');
      return JSON.parse(decoded) as HCSReputationMessage;
    });
  }
}
