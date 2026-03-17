import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeedbackEntity } from '../feedback/feedback.entity';
import { ValidationResponseEntity } from '../validation/validation-response.entity';

export enum TrustTier {
  UNVERIFIED = 'UNVERIFIED',
  VERIFIED = 'VERIFIED',
  TRUSTED = 'TRUSTED',
  ELITE = 'ELITE',
}

export interface OutlierInfo {
  feedbackId: string;
  fromAgentId: string;
  value: number;
  deviation: number;
  discountFactor: number;
}

export interface AggregatedReputation {
  agentId: string;
  feedbackCount: number;
  averageFeedbackValue: number;
  validationCount: number;
  averageValidationScore: number;
  feedbackByTag: Record<string, { count: number; avg: number }>;
  validationByTag: Record<string, { count: number; avg: number }>;
  trustTier: TrustTier;
  overallScore: number;
  lastActivity: number;
  reputationWeighted: boolean;
  outliers: OutlierInfo[];
  validatorWeighted: boolean;
}

// Outlier threshold: feedback deviating more than 1.5 standard deviations gets discounted
const OUTLIER_THRESHOLD = 1.5;

@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);

  constructor(
    @InjectRepository(FeedbackEntity)
    private readonly feedbackRepo: Repository<FeedbackEntity>,
    @InjectRepository(ValidationResponseEntity)
    private readonly valResponseRepo: Repository<ValidationResponseEntity>,
  ) {}

  /**
   * Cross-validation: detect outlier feedback using z-score method.
   * Returns discount factors for each feedback (1.0 = normal, <1.0 = outlier discounted).
   */
  private detectOutliers(
    feedback: FeedbackEntity[],
  ): { discounts: Map<string, number>; outliers: OutlierInfo[] } {
    const discounts = new Map<string, number>();
    const outliers: OutlierInfo[] = [];

    if (feedback.length < 3) {
      for (const f of feedback) discounts.set(f.feedbackId, 1.0);
      return { discounts, outliers };
    }

    const values = feedback.map((f) => Number(f.value) / Math.pow(10, f.valueDecimals || 0));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);

    if (stddev < 1) {
      for (const f of feedback) discounts.set(f.feedbackId, 1.0);
      return { discounts, outliers };
    }

    for (let i = 0; i < feedback.length; i++) {
      const f = feedback[i];
      const val = values[i];
      const zScore = Math.abs(val - mean) / stddev;

      if (zScore > OUTLIER_THRESHOLD) {
        // Discount scales: 1.5 stddev → 0.5x, 3.0+ stddev → 0.1x
        const discount = Math.max(0.1, 1.0 - (zScore - OUTLIER_THRESHOLD) / 3.0);
        discounts.set(f.feedbackId, discount);
        outliers.push({
          feedbackId: f.feedbackId,
          fromAgentId: f.fromAgentId,
          value: val,
          deviation: Math.round(zScore * 100) / 100,
          discountFactor: Math.round(discount * 100) / 100,
        });
      } else {
        discounts.set(f.feedbackId, 1.0);
      }
    }

    return { discounts, outliers };
  }

  /**
   * Get a lightweight reputation score for an agent without recursion.
   * Used internally to weight feedback/validations from other agents.
   */
  private async getBaseScore(agentId: string): Promise<number> {
    const feedback = await this.feedbackRepo.find({
      where: { agentId, isRevoked: false },
    });
    const responses = await this.valResponseRepo.find({
      where: { agentId },
    });

    const feedbackCount = feedback.length;
    const simpleAvg =
      feedbackCount > 0
        ? feedback.reduce((s, f) => s + Number(f.value) / Math.pow(10, f.valueDecimals || 0), 0) / feedbackCount
        : 0;
    const normalizedFeedback = (simpleAvg + 100) / 200;
    const feedbackConfidence = Math.min(1, feedbackCount / 5);
    const qualityScore = normalizedFeedback * 300 * feedbackConfidence;

    const validationCount = responses.length;
    const avgVal = validationCount > 0
      ? responses.reduce((s, r) => s + Number(r.response), 0) / validationCount
      : 0;
    const valConfidence = Math.min(1, validationCount / 3);
    const reliabilityScore = (avgVal / 100) * 300 * valConfidence;

    const totalActivity = feedbackCount + validationCount;
    const activityScore = Math.min(200, Math.log(1 + totalActivity) * 60);

    return Math.min(1000, qualityScore + reliabilityScore + activityScore);
  }

  async computeReputation(agentId: string): Promise<AggregatedReputation> {
    const feedback = await this.feedbackRepo.find({
      where: { agentId, isRevoked: false },
    });
    const responses = await this.valResponseRepo.find({
      where: { agentId },
    });

    const feedbackCount = feedback.length;

    // --- Cross-validation: detect and discount outlier feedback ---
    const { discounts: outlierDiscounts, outliers } = this.detectOutliers(feedback);

    // --- Reputation-weighted feedback with outlier discounting ---
    const giverIds = [...new Set(feedback.map((f) => f.fromAgentId))];
    const giverScores: Record<string, number> = {};
    for (const giverId of giverIds) {
      giverScores[giverId] = await this.getBaseScore(giverId);
    }

    const weightedSum = feedback.reduce((sum, f) => {
      const normalizedValue = Number(f.value) / Math.pow(10, f.valueDecimals || 0);
      const outlierDiscount = outlierDiscounts.get(f.feedbackId) ?? 1.0;
      if (f.feedbackType === 'community') return sum + normalizedValue * 0.5 * outlierDiscount;
      const giverScore = giverScores[f.fromAgentId] || 0;
      const reputationWeight = 0.2 + 0.8 * (giverScore / 1000);
      return sum + normalizedValue * reputationWeight * outlierDiscount;
    }, 0);
    const weightedTotal = feedback.reduce((sum, f) => {
      const outlierDiscount = outlierDiscounts.get(f.feedbackId) ?? 1.0;
      if (f.feedbackType === 'community') return sum + 0.5 * outlierDiscount;
      const giverScore = giverScores[f.fromAgentId] || 0;
      return sum + (0.2 + 0.8 * (giverScore / 1000)) * outlierDiscount;
    }, 0);
    const averageFeedbackValue =
      weightedTotal > 0 ? weightedSum / weightedTotal : 0;

    // Group by tag1 (also reputation-weighted)
    const feedbackByTag: Record<string, { count: number; avg: number }> = {};
    for (const f of feedback) {
      if (!feedbackByTag[f.tag1]) feedbackByTag[f.tag1] = { count: 0, avg: 0 };
      feedbackByTag[f.tag1].count++;
    }
    for (const tag of Object.keys(feedbackByTag)) {
      const tagFeedback = feedback.filter((f) => f.tag1 === tag);
      const tagWeightedSum = tagFeedback.reduce((s, f) => {
        const val = Number(f.value) / Math.pow(10, f.valueDecimals || 0);
        const od = outlierDiscounts.get(f.feedbackId) ?? 1.0;
        if (f.feedbackType === 'community') return s + val * 0.5 * od;
        const gs = giverScores[f.fromAgentId] || 0;
        return s + val * (0.2 + 0.8 * (gs / 1000)) * od;
      }, 0);
      const tagWeightedTotal = tagFeedback.reduce((s, f) => {
        const od = outlierDiscounts.get(f.feedbackId) ?? 1.0;
        if (f.feedbackType === 'community') return s + 0.5 * od;
        const gs = giverScores[f.fromAgentId] || 0;
        return s + (0.2 + 0.8 * (gs / 1000)) * od;
      }, 0);
      feedbackByTag[tag].avg = tagWeightedTotal > 0 ? tagWeightedSum / tagWeightedTotal : 0;
    }

    // --- Validation of Validators: weight validations by validator's reputation ---
    const validationCount = responses.length;
    const validatorIds = [...new Set(responses.map((r) => r.validatorId))];
    const validatorScores: Record<string, number> = {};
    for (const valId of validatorIds) {
      // Reuse giverScores if already fetched, otherwise fetch
      validatorScores[valId] = giverScores[valId] ?? await this.getBaseScore(valId);
    }

    const valWeightedSum = responses.reduce((sum, r) => {
      const vs = validatorScores[r.validatorId] || 0;
      const weight = 0.3 + 0.7 * (vs / 1000); // min 0.3x, max 1.0x
      return sum + Number(r.response) * weight;
    }, 0);
    const valWeightedTotal = responses.reduce((sum, r) => {
      const vs = validatorScores[r.validatorId] || 0;
      return sum + 0.3 + 0.7 * (vs / 1000);
    }, 0);
    const averageValidationScore =
      valWeightedTotal > 0 ? valWeightedSum / valWeightedTotal : 0;

    // Group validations by tag (also validator-weighted)
    const validationByTag: Record<string, { count: number; avg: number }> = {};
    for (const r of responses) {
      if (!validationByTag[r.tag]) validationByTag[r.tag] = { count: 0, avg: 0 };
      validationByTag[r.tag].count++;
    }
    for (const tag of Object.keys(validationByTag)) {
      const tagResps = responses.filter((r) => r.tag === tag);
      const tagValSum = tagResps.reduce((s, r) => {
        const vs = validatorScores[r.validatorId] || 0;
        return s + Number(r.response) * (0.3 + 0.7 * (vs / 1000));
      }, 0);
      const tagValTotal = tagResps.reduce((s, r) => {
        const vs = validatorScores[r.validatorId] || 0;
        return s + 0.3 + 0.7 * (vs / 1000);
      }, 0);
      validationByTag[tag].avg = tagValTotal > 0 ? tagValSum / tagValTotal : 0;
    }

    // Quality from feedback: map -100..100 to 0..300 (weight: 30%)
    const normalizedFeedback = (averageFeedbackValue + 100) / 200;
    const feedbackConfidence = Math.min(1, feedbackCount / 5);
    const qualityScore = Math.round(normalizedFeedback * 300 * feedbackConfidence);

    // Reliability from validations: map 0..100 to 0..300 (weight: 30%)
    const validationConfidence = Math.min(1, validationCount / 3);
    const reliabilityScore = Math.round(
      (averageValidationScore / 100) * 300 * validationConfidence,
    );

    // Activity: logarithmic scale (weight: 20%)
    const totalActivity = feedbackCount + validationCount;
    const activityScore = Math.round(Math.min(200, Math.log(1 + totalActivity) * 60));

    // Consistency bonus (weight: 20%) - low variance = higher score
    // ERC-8004: normalize values with valueDecimals
    const values = feedback.map((f) => Number(f.value) / Math.pow(10, f.valueDecimals || 0));
    let consistencyScore = 0;
    if (values.length >= 3) {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
      const stddev = Math.sqrt(variance);
      const maxStddev = 100;
      consistencyScore = Math.round((1 - stddev / maxStddev) * 200);
    } else if (values.length > 0) {
      consistencyScore = 50;
    }

    const overallScore = Math.min(
      1000,
      qualityScore + reliabilityScore + activityScore + consistencyScore,
    );

    // Determine tier
    let trustTier = TrustTier.UNVERIFIED;
    if (overallScore >= 800 && totalActivity >= 20) trustTier = TrustTier.ELITE;
    else if (overallScore >= 500 && totalActivity >= 10) trustTier = TrustTier.TRUSTED;
    else if (overallScore >= 200 && totalActivity >= 3) trustTier = TrustTier.VERIFIED;

    const lastFeedback =
      feedback.length > 0 ? Math.max(...feedback.map((f) => Number(f.timestamp))) : 0;
    const lastValidation =
      responses.length > 0 ? Math.max(...responses.map((r) => Number(r.timestamp))) : 0;

    return {
      agentId,
      feedbackCount,
      averageFeedbackValue: Math.round(averageFeedbackValue * 100) / 100,
      validationCount,
      averageValidationScore: Math.round(averageValidationScore * 100) / 100,
      feedbackByTag,
      validationByTag,
      trustTier,
      overallScore,
      lastActivity: Math.max(lastFeedback, lastValidation),
      reputationWeighted: true,
      outliers,
      validatorWeighted: true,
    };
  }
}
