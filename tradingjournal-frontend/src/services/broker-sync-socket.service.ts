import { io, type Socket } from 'socket.io-client';
import { AUTH_STORAGE_KEYS } from '../constants/auth.constants';
import { BROKER_SYNC_SOCKET_URL, MT5_SYNC_UPDATE_EVENT } from '../constants/broker-connection.constants';
import type { Mt5SyncUpdateEvent } from '../types/broker-connection.types';

type BrokerSyncSocketHandlers = {
  onSyncUpdate?: (payload: Mt5SyncUpdateEvent) => void;
};

let socket: Socket | null = null;

/**
 * Same shape as news-socket.service.ts on purpose — one WebSocket connection
 * pattern reused, not a second one invented. BrokerSyncGateway auto-joins the
 * caller's own private room server-side (see that file) purely from the verified JWT,
 * so there's no client-side room/subscription concept here at all — connect and
 * you're already listening to exactly your own events, nothing more.
 */
export const brokerSyncSocketService = {
  connect(handlers: BrokerSyncSocketHandlers) {
    if (!socket) {
      socket = io(BROKER_SYNC_SOCKET_URL, {
        transports: ['websocket', 'polling'],
        auth: { token: localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) ?? '' },
      });
    }

    this.disconnectListeners();

    if (handlers.onSyncUpdate) {
      socket.on(MT5_SYNC_UPDATE_EVENT, handlers.onSyncUpdate);
    }
  },

  disconnectListeners() {
    if (!socket) {
      return;
    }

    socket.off(MT5_SYNC_UPDATE_EVENT);
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
