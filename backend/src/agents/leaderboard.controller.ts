import { Controller, Get } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { ReputationService } from '../reputation/reputation.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly reputationService: ReputationService,
  ) {}

  @Get()
  async getLeaderboard() {
    const agents = await this.agentsService.findAll();
    const leaderboard = await Promise.all(
      agents.map(async (agent) => ({
        agent,
        reputation: await this.reputationService.computeReputation(agent.agentId),
      })),
    );

    leaderboard.sort((a, b) => b.reputation.overallScore - a.reputation.overallScore);
    return { leaderboard };
  }
}
