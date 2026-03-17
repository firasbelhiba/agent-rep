import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AgentsModule } from './agents/agents.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ValidationModule } from './validation/validation.module';
import { ReputationModule } from './reputation/reputation.module';
import { ActivityModule } from './activity/activity.module';
import { HederaModule } from './hedera/hedera.module';
import { SetupModule } from './setup/setup.module';
import { SystemConfigModule } from './config/system-config.module';
import { CommunityAuthModule } from './community-auth/community-auth.module';
import { StakingModule } from './staking/staking.module';
import { SystemConfigService } from './config/system-config.service';
import { HCSService } from './hedera/hcs.service';
import { HederaConfigService } from './hedera/hedera-config.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(
      process.env.DB_TYPE === 'postgres'
        ? {
            type: 'postgres',
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            username: process.env.DB_USER || 'agentrip',
            password: process.env.DB_PASSWORD || 'agentrip_dev',
            database: process.env.DB_NAME || 'agentrip',
            autoLoadEntities: true,
            synchronize: true,
          }
        : {
            type: 'better-sqlite3',
            database: process.env.DB_PATH || 'data/agentrip.db',
            autoLoadEntities: true,
            synchronize: true,
          },
    ),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 3600000, limit: 20 }],
    }),
    AgentsModule,
    FeedbackModule,
    ValidationModule,
    ReputationModule,
    ActivityModule,
    HederaModule,
    SetupModule,
    SystemConfigModule,
    CommunityAuthModule,
    StakingModule,
  ],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger('AppModule');

  constructor(
    private readonly systemConfig: SystemConfigService,
    private readonly hcsService: HCSService,
    private readonly hederaConfig: HederaConfigService,
  ) {}

  async onModuleInit() {
    if (!this.hederaConfig.isConfigured()) {
      this.logger.warn('Hedera is NOT configured — HCS logging disabled.');
      return;
    }

    const topics = await this.systemConfig.getHCSTopics();
    const missing: string[] = [];

    if (!topics.identity) missing.push('identity');
    if (!topics.feedback) missing.push('feedback');
    if (!topics.validation) missing.push('validation');

    if (missing.length > 0) {
      this.logger.warn(`Missing HCS topics: [${missing.join(', ')}]. Auto-creating...`);

      try {
        const created: Record<string, string> = {};

        if (!topics.identity) {
          created.identity = await this.hcsService.createTopic('AgentRep Identity');
          this.logger.log(`Created Identity topic: ${created.identity}`);
        }
        if (!topics.feedback) {
          created.feedback = await this.hcsService.createTopic('AgentRep Feedback');
          this.logger.log(`Created Feedback topic: ${created.feedback}`);
        }
        if (!topics.validation) {
          created.validation = await this.hcsService.createTopic('AgentRep Validation');
          this.logger.log(`Created Validation topic: ${created.validation}`);
        }

        await this.systemConfig.setHCSTopics({
          identity: topics.identity || created.identity,
          feedback: topics.feedback || created.feedback,
          validation: topics.validation || created.validation,
        });

        this.logger.log('HCS topics auto-created and saved. All on-chain logging is ACTIVE.');
      } catch (e) {
        this.logger.error('Failed to auto-create HCS topics. On-chain logging will be skipped!', e);
      }
    } else {
      this.logger.log(
        `HCS topics ready — Identity: ${topics.identity}, Feedback: ${topics.feedback}, Validation: ${topics.validation}`,
      );
    }
  }
}
