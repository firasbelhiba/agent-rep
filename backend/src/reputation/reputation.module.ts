import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReputationService } from './reputation.service';
import { FeedbackEntity } from '../feedback/feedback.entity';
import { ValidationResponseEntity } from '../validation/validation-response.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([FeedbackEntity, ValidationResponseEntity])],
  providers: [ReputationService],
  exports: [ReputationService],
})
export class ReputationModule {}
