import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ValidationRequestEntity } from './validation-request.entity';
import { ValidationResponseEntity } from './validation-response.entity';
import { ConnectionEntity } from '../hedera/connection.entity';
import { ValidationService } from './validation.service';
import { ValidationController } from './validation.controller';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ValidationRequestEntity, ValidationResponseEntity, ConnectionEntity]),
    forwardRef(() => AgentsModule),
  ],
  controllers: [ValidationController],
  providers: [ValidationService],
  exports: [ValidationService],
})
export class ValidationModule {}
