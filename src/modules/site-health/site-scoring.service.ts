import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  DEFAULT_SITE_SCORING_CONFIG,
  SiteScoringConfigData,
} from './site-health.types';
import {
  SITE_SCORING_CONFIG_ID,
  SiteScoringConfig,
} from './site-scoring-config.entity';
import { UpdateSiteScoringConfigDto } from './site-health.dto';

@Injectable()
export class SiteScoringService {
  constructor(
    @InjectRepository(SiteScoringConfig)
    private readonly configRepo: Repository<SiteScoringConfig>,
  ) {}

  async getConfig(): Promise<SiteScoringConfigData> {
    const row = await this.configRepo.findOne({
      where: { id: SITE_SCORING_CONFIG_ID },
    });
    if (!row) {
      await this.seedDefaults();
      return { ...DEFAULT_SITE_SCORING_CONFIG };
    }
    return this.normalizeConfig(row.config);
  }

  async updateConfig(
    dto: UpdateSiteScoringConfigDto,
    userId?: string,
  ): Promise<SiteScoringConfigData> {
    const normalized = this.normalizeConfig({
      weights: { ...dto.weights },
      bands: { ...dto.bands },
      dataCompletenessFloor: dto.dataCompletenessFloor,
    });
    this.assertWeightsSum(normalized.weights);

    const existing = await this.configRepo.findOne({
      where: { id: SITE_SCORING_CONFIG_ID },
    });
    if (existing) {
      existing.config = normalized;
      existing.updatedByUserId = userId ?? null;
      await this.configRepo.save(existing);
    } else {
      await this.configRepo.save(
        this.configRepo.create({
          id: SITE_SCORING_CONFIG_ID,
          config: normalized,
          updatedByUserId: userId ?? null,
        }),
      );
    }
    return normalized;
  }

  private async seedDefaults(): Promise<void> {
    const existing = await this.configRepo.findOne({
      where: { id: SITE_SCORING_CONFIG_ID },
    });
    if (existing) return;
    await this.configRepo.save(
      this.configRepo.create({
        id: SITE_SCORING_CONFIG_ID,
        config: { ...DEFAULT_SITE_SCORING_CONFIG },
      }),
    );
  }

  private normalizeConfig(
    raw: SiteScoringConfigData,
  ): SiteScoringConfigData {
    const weights = {
      driverAttendance:
        raw.weights?.driverAttendance ??
        DEFAULT_SITE_SCORING_CONFIG.weights.driverAttendance,
      vehicleAvailability:
        raw.weights?.vehicleAvailability ??
        DEFAULT_SITE_SCORING_CONFIG.weights.vehicleAvailability,
      tripTargetAchievement:
        raw.weights?.tripTargetAchievement ??
        DEFAULT_SITE_SCORING_CONFIG.weights.tripTargetAchievement,
      scheduleCompliance:
        raw.weights?.scheduleCompliance ??
        DEFAULT_SITE_SCORING_CONFIG.weights.scheduleCompliance,
      fuelEfficiencyVariance:
        raw.weights?.fuelEfficiencyVariance ??
        DEFAULT_SITE_SCORING_CONFIG.weights.fuelEfficiencyVariance,
      dataCompleteness:
        raw.weights?.dataCompleteness ??
        DEFAULT_SITE_SCORING_CONFIG.weights.dataCompleteness,
    };
    const bands = {
      goodMin: raw.bands?.goodMin ?? DEFAULT_SITE_SCORING_CONFIG.bands.goodMin,
      watchMin:
        raw.bands?.watchMin ?? DEFAULT_SITE_SCORING_CONFIG.bands.watchMin,
    };
    if (bands.watchMin > bands.goodMin) {
      bands.watchMin = bands.goodMin - 1;
    }
    return {
      weights,
      bands,
      dataCompletenessFloor:
        raw.dataCompletenessFloor ??
        DEFAULT_SITE_SCORING_CONFIG.dataCompletenessFloor,
    };
  }

  private assertWeightsSum(weights: SiteScoringConfigData['weights']): void {
    const sum =
      weights.driverAttendance +
      weights.vehicleAvailability +
      weights.tripTargetAchievement +
      weights.scheduleCompliance +
      weights.fuelEfficiencyVariance +
      weights.dataCompleteness;
    if (Math.abs(sum - 1) > 0.02) {
      throw new BadRequestException(
        'Dimension weights must sum to 1.0 (±0.02 tolerance).',
      );
    }
  }
}
