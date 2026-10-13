import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { FeedbackAnalysisService } from './feedback-analysis.service';
import {
  DeviationReason,
  EstimateFeedback,
} from './entities/estimate-feedback.entity';
import { Coefficient } from '../calibration/entities/coefficient.entity';
import { CalibrationService } from '../calibration/calibration.service';
import { EstimateSource } from '../estimates/entities/estimate.entity';

describe('FeedbackAnalysisService', () => {
  let service: FeedbackAnalysisService;
  let coefficientRepository: jest.Mocked<Repository<Coefficient>>;
  let feedbackRepository: jest.Mocked<Repository<EstimateFeedback>>;
  let calibrationService: jest.Mocked<CalibrationService>;

  beforeEach(async () => {
    coefficientRepository = {
      findOne: jest.fn(),
      create: jest.fn((value) => value as Coefficient),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Coefficient>>;

    feedbackRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<EstimateFeedback>>;

    calibrationService = {
      resetCache: jest.fn(),
    } as unknown as jest.Mocked<CalibrationService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackAnalysisService,
        {
          provide: getRepositoryToken(Coefficient),
          useValue: coefficientRepository,
        },
        {
          provide: getRepositoryToken(EstimateFeedback),
          useValue: feedbackRepository,
        },
        {
          provide: CalibrationService,
          useValue: calibrationService,
        },
      ],
    }).compile();

    service = module.get(FeedbackAnalysisService);
  });

  it('skips feedback that is not found with its task relation', async () => {
    feedbackRepository.findOne.mockResolvedValue(null);

    await service.analyzeFeedback({ id: 'feedback-id' } as EstimateFeedback);

    expect(coefficientRepository.save).not.toHaveBeenCalled();
    expect(calibrationService.resetCache).not.toHaveBeenCalled();
  });

  it('skips feedback for non-learning deviation reasons', async () => {
    feedbackRepository.findOne.mockResolvedValue({
      id: 'feedback-id',
      actualHours: 12,
      reasonForDeviation: DeviationReason.SCOPE_CREEP,
      task: {
        id: 'task-id',
        estimates: [
          { source: EstimateSource.AI_SUBTASK_SUM, finalEstimate: 8 },
        ],
      },
    } as EstimateFeedback);

    await service.analyzeFeedback({ id: 'feedback-id' } as EstimateFeedback);

    expect(coefficientRepository.save).not.toHaveBeenCalled();
    expect(calibrationService.resetCache).not.toHaveBeenCalled();
  });

  it('adjusts relevant coefficients when feedback deviation is actionable', async () => {
    feedbackRepository.findOne.mockResolvedValue({
      id: 'feedback-id',
      actualHours: 15,
      reasonForDeviation: DeviationReason.INCORRECT_INITIAL_ASSUMPTIONS,
      missedComplexityTags: ['legacy_code'],
      task: {
        id: 'task-id',
        experienceLevel: 'MIDDLE',
        complexityTags: ['third_party_integration'],
        project: { complexity: 'HIGH' },
        estimates: [
          { source: EstimateSource.AI_SUBTASK_SUM, finalEstimate: 10 },
        ],
      },
    } as EstimateFeedback);

    coefficientRepository.findOne.mockResolvedValue({
      key: 'experience.MIDDLE',
      value: 1,
    } as Coefficient);

    await service.analyzeFeedback({ id: 'feedback-id' } as EstimateFeedback);

    expect(coefficientRepository.save).toHaveBeenCalled();
    expect(calibrationService.resetCache).toHaveBeenCalled();
  });
});
