import { PostsController } from './posts.controller';

describe('PostsController', () => {
  it('should be defined', () => {
    const controller =
      new PostsController(
        {} as any,
      );

    expect(controller).toBeDefined();
  });
});
