import { io, type Socket } from 'socket.io-client';
import { NEWS_SOCKET_EVENTS, NEWS_SOCKET_URL } from '../constants/news.constants';
import type { NewsSocketPayload } from '../types/news.types';

type NewsSocketHandlers = {
  onCreated?: (payload: NewsSocketPayload) => void;
  onDataChanged?: (payload: NewsSocketPayload) => void;
  onAiEnriched?: (payload: NewsSocketPayload) => void;
};

let socket: Socket | null = null;

export const newsSocketService = {
  connect(handlers: NewsSocketHandlers) {
    if (!socket) {
      socket = io(NEWS_SOCKET_URL, {
        transports: ['websocket', 'polling'],
      });
    }

    this.disconnectListeners();

    if (handlers.onCreated) {
      socket.on(NEWS_SOCKET_EVENTS.CREATED, handlers.onCreated);
    }

    if (handlers.onDataChanged) {
      socket.on(NEWS_SOCKET_EVENTS.DATA_CHANGED, handlers.onDataChanged);
    }

    if (handlers.onAiEnriched) {
      socket.on(NEWS_SOCKET_EVENTS.AI_ENRICHED, handlers.onAiEnriched);
    }
  },

  disconnectListeners() {
    if (!socket) {
      return;
    }

    socket.off(NEWS_SOCKET_EVENTS.CREATED);
    socket.off(NEWS_SOCKET_EVENTS.DATA_CHANGED);
    socket.off(NEWS_SOCKET_EVENTS.AI_ENRICHED);
  },

  disconnect() {
    if (!socket) {
      return;
    }

    this.disconnectListeners();
    socket.disconnect();
    socket = null;
  },
};
