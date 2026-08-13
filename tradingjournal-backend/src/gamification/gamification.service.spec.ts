import { GamificationService } from './gamification.service';

describe('GamificationService', () => {
  it('should be defined', () => {
    const service =
      new GamificationService(
        {} as any,
      );

    expect(service).toBeDefined();
  });
});
