import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfigEntity } from './system-config.entity';

@Injectable()
export class SystemConfigService {
  private readonly logger = new Logger(SystemConfigService.name);

  constructor(
    @InjectRepository(SystemConfigEntity)
    private readonly repo: Repository<SystemConfigEntity>,
  ) {}

  async get(key: string): Promise<string | null> {
    const entry = await this.repo.findOneBy({ key });
    return entry?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.repo.upsert({ key, value }, ['key']);
  }

  async getHCSTopics(): Promise<{ identity?: string; feedback?: string; validation?: string }> {
    const [identity, feedback, validation] = await Promise.all([
      this.get('hcs_topic_identity'),
      this.get('hcs_topic_feedback'),
      this.get('hcs_topic_validation'),
    ]);

    const topics = {
      identity: identity ?? undefined,
      feedback: feedback ?? undefined,
      validation: validation ?? undefined,
    };

    // Warn loudly if any topics are missing
    const missing: string[] = [];
    if (!topics.identity) missing.push('identity');
    if (!topics.feedback) missing.push('feedback');
    if (!topics.validation) missing.push('validation');
    if (missing.length > 0) {
      this.logger.warn(
        `HCS topics NOT configured: [${missing.join(', ')}]. ` +
        `Run POST /api/setup to create them. HCS logging will be SKIPPED until topics are set up!`,
      );
    }

    return topics;
  }

  async setHCSTopics(topics: { identity?: string; feedback?: string; validation?: string }): Promise<void> {
    const entries = [
      { key: 'hcs_topic_identity', value: topics.identity },
      { key: 'hcs_topic_feedback', value: topics.feedback },
      { key: 'hcs_topic_validation', value: topics.validation },
    ].filter((e) => e.value);

    for (const entry of entries) {
      await this.set(entry.key, entry.value!);
    }
  }

  async getNFTCollectionId(): Promise<string | null> {
    return this.get('nft_collection_id');
  }

  async setNFTCollectionId(id: string): Promise<void> {
    await this.set('nft_collection_id', id);
  }
}
