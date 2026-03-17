import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedbackEntity } from './feedback.entity';
import { ConnectionEntity } from '../hedera/connection.entity';
import { FeedbackService } from './feedback.service';
import { FeedbackController } from './feedback.controller';
import { AgentsModule } from '../agents/agents.module';
import { CommunityAuthModule } from '../community-auth/community-auth.module';
import { StakingModule } from '../staking/staking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeedbackEntity, ConnectionEntity]),
    forwardRef(() => AgentsModule),
    CommunityAuthModule,
    forwardRef(() => StakingModule),
  ],
  controllers: [FeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
