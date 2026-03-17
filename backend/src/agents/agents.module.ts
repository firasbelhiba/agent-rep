import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentEntity } from './agent.entity';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { LeaderboardController } from './leaderboard.controller';
import { FeedbackModule } from '../feedback/feedback.module';
import { ValidationModule } from '../validation/validation.module';
import { StakingModule } from '../staking/staking.module';
import { CommunityAuthModule } from '../community-auth/community-auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentEntity]),
    FeedbackModule,
    ValidationModule,
    forwardRef(() => StakingModule),
    CommunityAuthModule,
  ],
  controllers: [AgentsController, LeaderboardController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
