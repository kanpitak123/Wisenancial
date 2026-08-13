import { GamificationController } from './gamification.controller';

describe('GamificationController', () => {
  it('should be defined', () => {
    const controller =
      new GamificationController(
        {} as any,
      );

    expect(controller).toBeDefined();
  });
});
