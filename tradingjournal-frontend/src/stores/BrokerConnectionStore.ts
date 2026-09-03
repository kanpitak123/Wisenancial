import { defineStore } from 'pinia';
import { isMockEnabled } from '../mocks/mock.config';
import { BROKER_CONNECTION_MESSAGES } from '../constants/broker-connection.constants';
import { brokerSyncSocketService } from '../services/broker-sync-socket.service';
import {
  brokerConnectionService,
  getBrokerConnectionErrorMessage,
} from '../services/broker-connection.service';
import type {
  BrokerConnection,
  BrokerType,
  CreatedBrokerConnection,
  RotatedBrokerConnection,
} from '../types/broker-connection.types';

export const useBrokerConnectionStore = defineStore('brokerConnection', {
  state: () => ({
    connections: [] as BrokerConnection[],
    isLoading: false,
    isSubmitting: false,
    error: null as string | null,
    /**
     * Plaintext API key is held ONLY in memory, ONLY right after create()/rotateKey()
     * succeeds — never persisted (not to localStorage, not back into `connections`,
     * which only ever carries the presenter shape with no key material at all).
     * The page clears this itself once the user acknowledges/navigates away.
     */
    revealedApiKey: null as string | null,
    socketConnected: false,
  }),

  getters: {
    hasConnections: (state) => state.connections.length > 0,
  },

  actions: {
    clearError() {
      this.error = null;
    },

    clearRevealedKey() {
      this.revealedApiKey = null;
    },

    async loadConnections() {
      this.isLoading = true;
      this.error = null;

      try {
        this.connections = await brokerConnectionService.list();
        return this.connections;
      } catch (error) {
        this.error = getBrokerConnectionErrorMessage(error, BROKER_CONNECTION_MESSAGES.loadFailed);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async createConnection(brokerType: BrokerType, portfolioId?: number) {
      this.isSubmitting = true;
      this.error = null;

      try {
        const result: CreatedBrokerConnection = await brokerConnectionService.create({
          broker_type: brokerType,
          ...(portfolioId !== undefined ? { portfolio_id: portfolioId } : {}),
        });

        this.connections = [result.connection, ...this.connections];
        this.revealedApiKey = result.apiKey;

        return result;
      } catch (error) {
        this.error = getBrokerConnectionErrorMessage(error, BROKER_CONNECTION_MESSAGES.createFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async revokeConnection(id: number) {
      this.isSubmitting = true;
      this.error = null;

      try {
        const updated = await brokerConnectionService.revoke(id);
        this.replaceConnection(updated);
        return updated;
      } catch (error) {
        this.error = getBrokerConnectionErrorMessage(error, BROKER_CONNECTION_MESSAGES.revokeFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async rotateKey(id: number) {
      this.isSubmitting = true;
      this.error = null;

      try {
        const result: RotatedBrokerConnection = await brokerConnectionService.rotateKey(id);
        this.replaceConnection(result.connection);
        this.revealedApiKey = result.apiKey;
        return result;
      } catch (error) {
        this.error = getBrokerConnectionErrorMessage(error, BROKER_CONNECTION_MESSAGES.rotateFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async removeConnection(id: number) {
      this.isSubmitting = true;
      this.error = null;

      try {
        await brokerConnectionService.remove(id);
        this.connections = this.connections.filter((c) => c.id !== id);
      } catch (error) {
        this.error = getBrokerConnectionErrorMessage(error, BROKER_CONNECTION_MESSAGES.deleteFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    replaceConnection(updated: BrokerConnection) {
      this.connections = this.connections.map((c) => (c.id === updated.id ? updated : c));
    },

    /**
     * Phase 3L follow-up — listen for mt5_sync_update and refetch rather than trying
     * to merge the event's metadata-only payload into local state (it never carries
     * trade/position data by design — see broker-sync.gateway.ts). Refetch-on-signal
     * keeps BrokerConnectionStore as the single source of truth for connection state,
     * with the REST response (not the socket event) as what's actually rendered.
     */
    handleSyncUpdate() {
      void this.loadConnections().catch(() => null);
    },

    connectSocket() {
      if (this.socketConnected) {
        return;
      }

      // mock mode ไม่มี backend ให้ต่อ — ข้ามไปเลย เหมือน NewsStore.connectSocket()
      if (isMockEnabled()) {
        return;
      }

      brokerSyncSocketService.connect({
        onSyncUpdate: () => this.handleSyncUpdate(),
      });

      this.socketConnected = true;
    },

    disconnectSocket() {
      brokerSyncSocketService.disconnect();
      this.socketConnected = false;
    },

    clear() {
      this.disconnectSocket();
      this.connections = [];
      this.isLoading = false;
      this.isSubmitting = false;
      this.error = null;
      this.revealedApiKey = null;
    },
  },
});
