import type { AxiosError } from 'axios';
import { api } from 'src/boot/axios';
import { MT5_CLOUD_CONNECTOR_API_PATH } from 'src/constants/mt5-cloud-connector.constants';

/**
 * Client for the real, gated-beta MT5 investor-password connector — see
 * docs/mt5-investor-password-spike.md, "Beta graduation work". Every call here can fail
 * with a plain 404 for any user not on the backend's beta allowlist (see
 * Mt5CloudConnectorBetaGuard); BrokerConnectionsPage.vue checks `betaStatus()` before
 * ever rendering the entry point that would call the rest of these. Distinct from
 * src/services/mt5-cloud-spike.service.ts (the dev-only /dev/mt5-cloud-spike page).
 */

export interface Mt5CloudConnectorHandle {
  kind: 'CLOUD';
  ref: string;
}

export interface Mt5CloudAccountSnapshot {
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

export interface Mt5CloudPosition {
  ticket: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  currentPrice: number | null;
  profit: number | null;
  openedAt: string | null;
}

export interface Mt5CloudDeal {
  ticket: string;
  symbol: string | null;
  volume: number | null;
  price: number | null;
  profit: number;
  commission: number | null;
  swap: number | null;
  executedAt: string;
}

export interface Mt5CloudStatus {
  state: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR';
  message?: string;
  checkedAt: string;
}

export interface Mt5CloudSyncResult {
  state: Mt5CloudStatus['state'];
  redeployed: boolean;
}

export interface Mt5CloudRecord {
  id: string;
  login: string;
  server: string;
  metaApiAccountId: string | null;
  deployState: 'DEPLOYED' | 'UNDEPLOYED' | null;
  createdAt: string;
  connectedAt: string | null;
  lastActivityAt: string | null;
}

export interface Mt5CloudDeployLogEntry {
  id: string;
  recordId: string;
  transition: 'deploy' | 'undeploy';
  reason: string;
  metaApiAccountId: string | null;
  at: string;
}

export function getMt5CloudConnectorErrorMessage(error: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  const axiosError = error as AxiosError<{ message?: string | string[]; code?: string }>;
  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.message ?? fallback;
}

export const mt5CloudConnectorService = {
  /** Safe to call for any logged-in user — returns only a boolean. */
  async betaStatus(): Promise<{ enabled: boolean }> {
    const response = await api.get<{ enabled: boolean }>(`${MT5_CLOUD_CONNECTOR_API_PATH}/beta-status`);
    return response.data;
  },

  async listRecords(): Promise<Mt5CloudRecord[]> {
    const response = await api.get<Mt5CloudRecord[]>(`${MT5_CLOUD_CONNECTOR_API_PATH}/records`);
    return response.data;
  },

  async listDeployLog(): Promise<Mt5CloudDeployLogEntry[]> {
    const response = await api.get<Mt5CloudDeployLogEntry[]>(`${MT5_CLOUD_CONNECTOR_API_PATH}/deploy-log`);
    return response.data;
  },

  async connect(
    login: string,
    investorPassword: string,
    server: string,
    consentAccepted: boolean,
  ): Promise<Mt5CloudConnectorHandle> {
    const response = await api.post<Mt5CloudConnectorHandle>(`${MT5_CLOUD_CONNECTOR_API_PATH}/connect`, {
      login,
      investorPassword,
      server,
      consentAccepted,
    });
    return response.data;
  },

  /** `trigger: 'manual'` for the explicit refresh button, `'auto'` for the background
   * poll — the backend logs these under different deploy-log reasons. */
  async sync(ref: string, trigger: 'manual' | 'auto'): Promise<Mt5CloudSyncResult> {
    const response = await api.post<Mt5CloudSyncResult>(`${MT5_CLOUD_CONNECTOR_API_PATH}/${ref}/sync`, null, {
      params: { trigger },
    });
    return response.data;
  },

  async getStatus(ref: string): Promise<Mt5CloudStatus> {
    const response = await api.get<Mt5CloudStatus>(`${MT5_CLOUD_CONNECTOR_API_PATH}/${ref}/status`);
    return response.data;
  },

  async getAccount(ref: string): Promise<Mt5CloudAccountSnapshot> {
    const response = await api.get<Mt5CloudAccountSnapshot>(`${MT5_CLOUD_CONNECTOR_API_PATH}/${ref}/account`);
    return response.data;
  },

  async getPositions(ref: string): Promise<Mt5CloudPosition[]> {
    const response = await api.get<Mt5CloudPosition[]>(`${MT5_CLOUD_CONNECTOR_API_PATH}/${ref}/positions`);
    return response.data;
  },

  async getDeals(ref: string, sinceDays = 30): Promise<Mt5CloudDeal[]> {
    const response = await api.get<Mt5CloudDeal[]>(`${MT5_CLOUD_CONNECTOR_API_PATH}/${ref}/deals`, {
      params: { sinceDays },
    });
    return response.data;
  },

  async disconnect(ref: string): Promise<void> {
    await api.delete(`${MT5_CLOUD_CONNECTOR_API_PATH}/${ref}`);
  },
};
