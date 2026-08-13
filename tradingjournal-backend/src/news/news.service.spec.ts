import { NewsService } from './news.service';

describe('NewsService', () => {
  it('should be defined with mocked dependencies', () => {
    const service = new NewsService({} as any, {} as any);
    expect(service).toBeDefined();
  });
});
