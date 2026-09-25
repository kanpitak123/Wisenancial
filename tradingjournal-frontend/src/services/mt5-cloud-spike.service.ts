import type { AxiosError } from 'axios';
import { api } from 'src/boot/axios';

/**
 * Client for the dev-only spike backend (docs/mt5-investor-password-spike.md,
 * tradingjournal-backend/src/mt5-cloud-spike/). Not part of the real broker-connections
 * feature — see src/services/broker-connection.service.ts for that. The backend route
 * 404s unless MT5_CLOUD_SPIKE_ENABLED=true, so every call here can fail with a plain
 * 404 in any environment where the spike isn't turned on.
 */

const BASE_PATH = '/dev/mt5-cloud-spike';

export type Mt5SpikeConnectorKind = 'EA' | 'CLOUD';

export interface Mt5SpikeConnectorHandle {
  kind: Mt5SpikeConnectorKind;
  ref: string;
}

export interface Mt5SpikeAccountSnapshot {
  broker: string | null;
  currency: string;
  balance: number;
  equity: number | null;
  margin: number | null;
  freeMargin: number | null;
  marginLevel: number | null;
  leverage: number | null;
  credit: number | null;
}

export interface Mt5SpikePosition {
  ticket: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  currentPrice: number | null;
  profit: number | null;
  openedAt: string | null;
}

export interface Mt5SpikeDeal {
  ticket: string;
  symbol: string | null;
  volume: number | null;
  price: number | null;
  profit: number;
  commission: number | null;
  swap: number | null;
  executedAt: string;
}

export interface Mt5SpikeStatus {
  state: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR';
  message?: string;
  checkedAt: string;
}

export interface Mt5SpikeEaConnection {
  id: number;
  broker_type: string;
  status: string;
  external_account_id: string | null;
  broker_server: string | null;
  last_heartbeat_at: string | null;
  last_sync_at: string | null;
}

export interface Mt5SpikeCloudRecord {
  id: string;
  login: string;
  server: string;
  metaApiAccountId: string | null;
  createdAt: string;
  connectedAt: string | null;
}

export function getMt5SpikeErrorMessage(error: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  const axiosError = error as AxiosError<{ message?: string | string[]; code?: string }>;
  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.message ?? fallback;
}

export const mt5CloudSpikeService = {
  async listEaConnections(): Promise<Mt5SpikeEaConnection[]> {
    const response = await api.get<Mt5SpikeEaConnection[]>(`${BASE_PATH}/ea-connections`);
    return response.data;
  },

  async listCloudRecords(): Promise<Mt5SpikeCloudRecord[]> {
    const response = await api.get<Mt5SpikeCloudRecord[]>(`${BASE_PATH}/cloud-records`);
    return response.data;
  },

  async connectEa(brokerConnectionId: number): Promise<Mt5SpikeConnectorHandle> {
    const response = await api.post<Mt5SpikeConnectorHandle>(`${BASE_PATH}/connect`, {
      kind: 'EA',
      brokerConnectionId,
    });
    return response.data;
  },

  async connectCloud(login: string, investorPassword: string, server: string): Promise<Mt5SpikeConnectorHandle> {
    const response = await api.post<Mt5SpikeConnectorHandle>(`${BASE_PATH}/connect`, {
      kind: 'CLOUD',
      login,
      investorPassword,
      server,
    });
    return response.data;
  },

  async disconnect(kind: Mt5SpikeConnectorKind, ref: string): Promise<void> {
    await api.delete(`${BASE_PATH}/${kind}/${ref}`);
  },

  async getStatus(kind: Mt5SpikeConnectorKind, ref: string): Promise<Mt5SpikeStatus> {
    const response = await api.get<Mt5SpikeStatus>(`${BASE_PATH}/${kind}/${ref}/status`);
    return response.data;
  },

  async getAccount(kind: Mt5SpikeConnectorKind, ref: string): Promise<Mt5SpikeAccountSnapshot> {
    const response = await api.get<Mt5SpikeAccountSnapshot>(`${BASE_PATH}/${kind}/${ref}/account`);
    return response.data;
  },

  async getPositions(kind: Mt5SpikeConnectorKind, ref: string): Promise<Mt5SpikePosition[]> {
    const response = await api.get<Mt5SpikePosition[]>(`${BASE_PATH}/${kind}/${ref}/positions`);
    return response.data;
  },

  async getDeals(kind: Mt5SpikeConnectorKind, ref: string, sinceDays = 30): Promise<Mt5SpikeDeal[]> {
    const response = await api.get<Mt5SpikeDeal[]>(`${BASE_PATH}/${kind}/${ref}/deals`, {
      params: { sinceDays },
    });
    return response.data;
  },
};
