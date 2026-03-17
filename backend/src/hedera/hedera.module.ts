import { Module, Global, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HederaConfigService } from './hedera-config.service';
import { HCSService } from './hcs.service';
import { HTSService } from './hts.service';
import { HCS10Service } from './hcs10.service';
import { ConnectionEntity } from './connection.entity';
import { ConnectionsController } from './connections.controller';
import { AgentsModule } from '../agents/agents.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([ConnectionEntity]),
    forwardRef(() => AgentsModule),
  ],
  controllers: [ConnectionsController],
  providers: [HederaConfigService, HCSService, HTSService, HCS10Service],
  exports: [HederaConfigService, HCSService, HTSService, HCS10Service, TypeOrmModule],
})
export class HederaModule {}
