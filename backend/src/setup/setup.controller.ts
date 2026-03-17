import { Controller, Get, Post, HttpException, HttpStatus } from '@nestjs/common';
import { HCSService } from '../hedera/hcs.service';
import { HTSService } from '../hedera/hts.service';
import { HederaConfigService } from '../hedera/hedera-config.service';
import { SystemConfigService } from '../config/system-config.service';

@Controller('setup')
export class SetupController {
  constructor(
    private readonly hcsService: HCSService,
    private readonly htsService: HTSService,
    private readonly hederaConfig: HederaConfigService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  @Get('status')
  async status() {
    const topics = await this.systemConfig.getHCSTopics();
    const nftCollectionId = await this.systemConfig.getNFTCollectionId();
    return {
      topics,
      nftCollectionId,
      hederaConfigured: this.hederaConfig.isConfigured(),
    };
  }

  @Post()
  async setup() {
    if (!this.hederaConfig.isConfigured()) {
      throw new HttpException(
        'Hedera is not configured. Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY environment variables.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existingTopics = await this.systemConfig.getHCSTopics();
    const existingNftId = await this.systemConfig.getNFTCollectionId();

    if (
      existingTopics.identity &&
      existingTopics.feedback &&
      existingTopics.validation &&
      existingNftId
    ) {
      return {
        topics: existingTopics,
        nftCollectionId: existingNftId,
        success: true,
        message: 'Already configured',
      };
    }

    const identityTopicId =
      existingTopics.identity || (await this.hcsService.createTopic('AgentRep Identity'));
    const feedbackTopicId =
      existingTopics.feedback || (await this.hcsService.createTopic('AgentRep Feedback'));
    const validationTopicId =
      existingTopics.validation || (await this.hcsService.createTopic('AgentRep Validation'));

    const topics = {
      identity: identityTopicId,
      feedback: feedbackTopicId,
      validation: validationTopicId,
    };
    await this.systemConfig.setHCSTopics(topics);

    let nftCollectionId = existingNftId;
    if (!nftCollectionId) {
      nftCollectionId = await this.htsService.createReputationNFTCollection();
      await this.systemConfig.setNFTCollectionId(nftCollectionId);
    }

    return { topics, nftCollectionId, success: true };
  }
}
