import { Test, TestingModule } from '@nestjs/testing';
import { PortfoliosController } from './portfolios.controller';
import { PortfoliosService } from './portfolios.service';

const portfoliosServiceMock = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('PortfoliosController', () => {
  let controller: PortfoliosController;

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule({
        controllers: [PortfoliosController],
        providers: [
          {
            provide: PortfoliosService,
            useValue: portfoliosServiceMock,
          },
        ],
      }).compile();

    controller = module.get<PortfoliosController>(
      PortfoliosController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
