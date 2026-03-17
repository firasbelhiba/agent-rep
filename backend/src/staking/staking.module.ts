import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StakeEntity } from './stake.entity';
import { DisputeEntity } from './dispute.entity';
import { StakingService } from './staking.service';
import { StakingController } from './staking.controller';
import { StakingContractService } from '../hedera/staking-contract.service';
import { HederaConfigService } from '../hedera/hedera-config.service';
import { AgentsModule } from '../agents/agents.module';
import { FeedbackModule } from '../feedback/feedback.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StakeEntity, DisputeEntity]),
    forwardRef(() => AgentsModule),
    forwardRef(() => FeedbackModule),
  ],
  controllers: [StakingController],
  providers: [StakingService, StakingContractService, HederaConfigService],
  exports: [StakingService],
})
export class StakingModule {}
