import { Controller, Get, Query } from '@nestjs/common';
import { FeedbackService } from '../feedback/feedback.service';
import { ValidationService } from '../validation/validation.service';

@Controller('activity')
export class ActivityController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly validationService: ValidationService,
  ) {}

  @Get()
  async getActivity(@Query('limit') limitParam?: string) {
    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    const [recentFeedback, recentResponses] = await Promise.all([
      this.feedbackService.getRecentFeedback(limit),
      this.validationService.getRecentResponses(limit),
    ]);

    const activities: Array<{
      type: 'feedback' | 'validation';
      timestamp: number;
      data: any;
    }> = [];

    for (const f of recentFeedback) {
      activities.push({ type: 'feedback', timestamp: Number(f.timestamp), data: f });
    }
    for (const v of recentResponses) {
      activities.push({ type: 'validation', timestamp: Number(v.timestamp), data: v });
    }

    activities.sort((a, b) => b.timestamp - a.timestamp);
    return { activities: activities.slice(0, limit) };
  }
}
