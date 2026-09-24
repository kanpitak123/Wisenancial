import { Controller, Post, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { NewsClassifierService } from './news-classifier.service';
import { ClassifyNewsDto } from './dto/classify-news.dto';
import { ClassifyBatchNewsDto } from './dto/classify-batch-news.dto';
import { ClassifyNewsResponseDto, BatchClassifyNewsResponseDto } from './dto/classify-news-response.dto';
import { V5AnalyzeNewsResult, BatchV5AnalyzeNewsResult } from './interfaces/news-classifier.interface';

@Controller('ai/news')
export class NewsClassifierController {
  constructor(private readonly newsClassifierService: NewsClassifierService) {}

  /**
   * V.5 Primary Endpoint: Dual-sided, strictly neutral market impact analysis.
   */
  @Post('v5/analyze')
  @HttpCode(HttpStatus.OK)
  async analyzeV5(@Body() dto: ClassifyNewsDto): Promise<V5AnalyzeNewsResult> {
    return await this.newsClassifierService.analyzeV5(dto);
  }

  /**
   * V.5 Batch Endpoint
   */
  @Post('v5/analyze-batch')
  @HttpCode(HttpStatus.OK)
  async analyzeBatchV5(@Body() dto: ClassifyBatchNewsDto): Promise<BatchV5AnalyzeNewsResult> {
    return await this.newsClassifierService.analyzeBatchV5(dto.articles);
  }

  /**
   * V.4 Backward-Compatible Endpoint
   */
  @Post('classify')
  @HttpCode(HttpStatus.OK)
  async classify(@Body() dto: ClassifyNewsDto): Promise<ClassifyNewsResponseDto> {
    return await this.newsClassifierService.classify(dto);
  }

  /**
   * V.4 Backward-Compatible Batch Endpoint
   */
  @Post('classify-batch')
  @HttpCode(HttpStatus.OK)
  async classifyBatch(@Body() dto: ClassifyBatchNewsDto): Promise<BatchClassifyNewsResponseDto> {
    return await this.newsClassifierService.classifyBatch(dto.articles);
  }

  /**
   * Readiness probe and configuration health check.
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  health() {
    return this.newsClassifierService.healthCheck();
  }
}
