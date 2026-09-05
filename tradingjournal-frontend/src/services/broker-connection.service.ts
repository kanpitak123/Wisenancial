import type { AxiosError } from 'axios';
import { api } from 'src/boot/axios';
import { BROKER_CONNECTIONS_API_PATH } from '../constants/broker-connection.constants';
import type {
  ApiErrorResponse,
  BrokerConnection,
  CreateBrokerConnectionPayload,
  CreatedBrokerConnection,
  RotatedBrokerConnection,
} from '../types/broker-connection.types';

export function getBrokerConnectionErrorMessage(error: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.message ?? fallback;
}

export const brokerConnectionService = {
  async list(): Promise<BrokerConnection[]> {
    const response = await api.get<BrokerConnection[]>(BROKER_CONNECTIONS_API_PATH);
    return response.data;
  },

  async create(payload: CreateBrokerConnectionPayload): Promise<CreatedBrokerConnection> {
    const response = await api.post<CreatedBrokerConnection>(BROKER_CONNECTIONS_API_PATH, payload);
    return response.data;
  },

  async get(id: number): Promise<BrokerConnection> {
    const response = await api.get<BrokerConnection>(`${BROKER_CONNECTIONS_API_PATH}/${id}`);
    return response.data;
  },

  async revoke(id: number): Promise<BrokerConnection> {
    const response = await api.post<BrokerConnection>(`${BROKER_CONNECTIONS_API_PATH}/${id}/revoke`);
    return response.data;
  },

  async rotateKey(id: number): Promise<RotatedBrokerConnection> {
    const response = await api.post<RotatedBrokerConnection>(
      `${BROKER_CONNECTIONS_API_PATH}/${id}/rotate-key`,
    );
    return response.data;
  },

  async remove(id: number): Promise<{ message: string }> {
    const response = await api.delete<{ message: string }>(`${BROKER_CONNECTIONS_API_PATH}/${id}`);
    return response.data;
  },
};
