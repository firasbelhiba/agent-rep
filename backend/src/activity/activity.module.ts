import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { FeedbackModule } from '../feedback/feedback.module';
import { ValidationModule } from '../validation/validation.module';

@Module({
  imports: [FeedbackModule, ValidationModule],
  controllers: [ActivityController],
})
export class ActivityModule {}
