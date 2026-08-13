import { PostsService } from './posts.service';

describe('PostsService', () => {
  it('should be defined', () => {
    const service = new PostsService(
      {} as any,
    );

    expect(service).toBeDefined();
  });
});
