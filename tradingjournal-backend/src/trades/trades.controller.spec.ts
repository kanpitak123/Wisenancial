import { TradesController } from './trades.controller';

describe('TradesController', () => {
  it('should be defined with mocked dependencies', () => {
    const controller = new TradesController({} as any, {} as any, {} as any);
    expect(controller).toBeDefined();
  });
});
