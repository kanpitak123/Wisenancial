import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { NewsScope } from './dto/news-query.dto';

@WebSocketGateway({ cors: { origin: '*' } })
export class NewsGateway {
  @WebSocketServer()
  server!: Server;

  broadcastNewsUpdate(
    event: 'new_news' | 'news_data_changed' | 'news_ai_enriched',
    scope: Exclude<NewsScope, NewsScope.ALL>,
    data: unknown,
  ) {
    this.server.emit(event, { scope, data });
  }
}
