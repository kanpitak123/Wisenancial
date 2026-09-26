import { BadRequestException } from '@nestjs/common';
import { PortfolioType } from '@prisma/client';
import { PostsService } from './posts.service';

/**
 * Post images go through the storage driver. Before, the upload used memory storage and the
 * service read file.filename, so every image URL was "/uploads/posts/undefined".
 */

function makeService() {
  const postImagesCreate = jest.fn().mockResolvedValue({});
  const tx = {
    posts: { create: jest.fn().mockResolvedValue({ id: 5 }) },
    post_images: { create: postImagesCreate },
  };
  const prisma = {
    portfolios: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 3, portfolio_type: PortfolioType.TRADER }),
    },
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const put = jest.fn().mockResolvedValue({
    key: 'posts/k.png',
    url: '/uploads/posts/k.png',
    absoluteUrl: 'https://api/uploads/posts/k.png',
  });

  const service = new PostsService(prisma as never, { put } as never);
  jest.spyOn(service as never, 'requireOwnedPortfolio').mockResolvedValue({
    id: 3,
    portfolio_type: PortfolioType.TRADER,
  } as never);
  jest
    .spyOn(service as never, 'validateReference')
    .mockResolvedValue(null as never);
  jest.spyOn(service, 'findOne').mockResolvedValue({ id: 5 } as never);

  return { service, put, postImagesCreate, prisma };
}

const dto = { portfolio_id: 3, content: 'hi', asset_symbol: 'AAPL' } as never;

const file = (mimetype: string) =>
  ({
    mimetype,
    buffer: Buffer.from('bytes'),
    originalname: 'x',
  }) as Express.Multer.File;

describe('PostsService.create with an image', () => {
  it('stores the image through the storage driver and saves the URL it returns', async () => {
    const { service, put, postImagesCreate } = makeService();

    await service.create(1, dto, file('image/png'));

    const [key, body, type] = put.mock.calls[0] as [string, Buffer, string];
    expect(key).toMatch(/^posts\/[0-9a-f-]{36}\.png$/);
    expect(body.toString()).toBe('bytes');
    expect(type).toBe('image/png');
    expect(postImagesCreate).toHaveBeenCalledWith({
      data: { post_id: 5, image_url: '/uploads/posts/k.png' },
    });
    // never the old broken value
    expect(JSON.stringify(postImagesCreate.mock.calls)).not.toContain(
      'undefined',
    );
  });

  it.each([
    ['image/jpeg', 'jpg'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif'],
  ])('accepts %s and names it .%s', async (mimetype, extension) => {
    const { service, put } = makeService();

    await service.create(1, dto, file(mimetype));

    expect((put.mock.calls[0] as [string])[0]).toMatch(
      new RegExp(`\\.${extension}$`),
    );
  });

  it.each(['text/html', 'image/svg+xml', 'application/pdf'])(
    'rejects %s before anything is stored or created',
    async (mimetype) => {
      const { service, put, prisma } = makeService();

      await expect(
        service.create(1, dto, file(mimetype)),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(put).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('a post without an image touches no storage', async () => {
    const { service, put, postImagesCreate } = makeService();

    await service.create(1, dto);

    expect(put).not.toHaveBeenCalled();
    expect(postImagesCreate).not.toHaveBeenCalled();
  });

  it('a storage failure fails the request and creates no post', async () => {
    const { service, put, prisma } = makeService();
    put.mockRejectedValue(new Error('bucket unreachable'));

    await expect(service.create(1, dto, file('image/png'))).rejects.toThrow(
      'bucket unreachable',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
