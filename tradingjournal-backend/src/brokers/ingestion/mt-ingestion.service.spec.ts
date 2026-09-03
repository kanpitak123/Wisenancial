import { BrokerConnectionStatus, BrokerType } from '@prisma/client';
import { BrokerConnectionsService } from '../connections/broker-connections.service';
import { MtIngestionService } from './mt-ingestion.service';

const connectionsMock = {
  recordHeartbeat: jest.fn(),
};

describe('MtIngestionService', () => {
  let service: MtIngestionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MtIngestionService(connectionsMock as unknown as BrokerConnectionsService);
  });

  it('heartbeat() ส่งต่อไปที่ BrokerConnectionsService.recordHeartbeat() ด้วย id ของ connection ที่ guard แนบมาให้', async () => {
    const connection = {
      id: 7,
      user_id: 1,
      broker_type: BrokerType.MT5,
      status: BrokerConnectionStatus.ACTIVE,
    } as any;
    connectionsMock.recordHeartbeat.mockResolvedValue({ id: 7 });

    await service.heartbeat(connection);

    expect(connectionsMock.recordHeartbeat).toHaveBeenCalledWith(7);
  });
});
