import { Injectable, Logger } from '@nestjs/common';
import {
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  TokenId,
  TokenUpdateNftsTransaction,
  Long,
} from '@hashgraph/sdk';
import { HederaConfigService } from './hedera-config.service';

export enum TrustTier {
  UNVERIFIED = 'UNVERIFIED',
  VERIFIED = 'VERIFIED',
  TRUSTED = 'TRUSTED',
  ELITE = 'ELITE',
}

export interface ReputationNFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes: {
    trust_tier: TrustTier;
    overall_score: number;
    feedback_count: number;
    validation_score: number;
    staked_hbar: number;
  };
}

@Injectable()
export class HTSService {
  private readonly logger = new Logger(HTSService.name);

  constructor(private readonly hederaConfig: HederaConfigService) {}

  async createReputationNFTCollection(): Promise<string> {
    const client = this.hederaConfig.getClient();
    const transaction = new TokenCreateTransaction()
      .setTokenName('AgentRep Trust Badge')
      .setTokenSymbol('AREP')
      .setTokenType(TokenType.NonFungibleUnique)
      .setSupplyType(TokenSupplyType.Infinite)
      .setTreasuryAccountId(client.operatorAccountId!)
      .setSupplyKey(client.operatorPublicKey!)
      .setAdminKey(client.operatorPublicKey!)
      .setTokenMemo('AgentRep - On-chain Reputation for AI Agents');

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);
    const tokenId = receipt.tokenId!.toString();

    this.logger.log(`Created NFT collection: ${tokenId}`);
    return tokenId;
  }

  async mintReputationNFT(
    tokenId: string,
    metadata: ReputationNFTMetadata,
  ): Promise<{ serialNumber: number }> {
    const client = this.hederaConfig.getClient();
    const metadataBytes = Buffer.from(JSON.stringify(metadata));

    const transaction = new TokenMintTransaction()
      .setTokenId(TokenId.fromString(tokenId))
      .addMetadata(metadataBytes);

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);
    const serialNumber = receipt.serials![0].toNumber();

    this.logger.log(`Minted Reputation NFT #${serialNumber} for ${metadata.name}`);
    return { serialNumber };
  }

  static generateBadgeSVG(tier: TrustTier, score: number): string {
    const colors: Record<TrustTier, { bg: string; accent: string }> = {
      [TrustTier.UNVERIFIED]: { bg: '#6B7280', accent: '#9CA3AF' },
      [TrustTier.VERIFIED]: { bg: '#2563EB', accent: '#60A5FA' },
      [TrustTier.TRUSTED]: { bg: '#7C3AED', accent: '#A78BFA' },
      [TrustTier.ELITE]: { bg: '#F59E0B', accent: '#FCD34D' },
    };
    const { bg, accent } = colors[tier];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
      <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${bg}"/><stop offset="100%" style="stop-color:${accent}"/>
      </linearGradient></defs>
      <rect width="400" height="400" rx="20" fill="url(#bg)"/>
      <text x="200" y="120" text-anchor="middle" fill="white" font-size="24" font-weight="bold">AgentRep</text>
      <text x="200" y="200" text-anchor="middle" fill="white" font-size="72" font-weight="bold">${score}</text>
      <text x="200" y="260" text-anchor="middle" fill="white" font-size="20" opacity="0.9">Trust Score</text>
      <text x="200" y="320" text-anchor="middle" fill="${accent}" font-size="28" font-weight="bold">${tier}</text>
    </svg>`;
  }
}
