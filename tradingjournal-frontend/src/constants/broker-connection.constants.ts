export const BROKER_CONNECTIONS_API_PATH = '/brokers/connections';

/** ต้องตรงกับ path ที่ประกาศใน router/routes.ts เป๊ะ ('BrokerConnections' ใต้ MainLayout ที่ path root '/') */
export const BROKER_CONNECTIONS_ROUTE = '/BrokerConnections';

/** query param ที่ /BrokerConnections อ่านเพื่อ pre-select portfolio ในฟอร์มสร้าง connection หรือ scroll ไปหา connection ที่ผูกกับ portfolio นั้นอยู่แล้ว — ตั้งชื่อโดย PortfolioPage.vue ตอน navigate มา */
export const BROKER_CONNECTIONS_PORTFOLIO_QUERY_PARAM = 'portfolio_id';

// เหมือน NEWS_SOCKET_URL (news.constants.ts) เป๊ะ — แกะ /api ท้าย URL ออกเพราะ
// socket.io ต่อที่ root ของ backend ไม่ใช่ prefix เดียวกับ REST
export const BROKER_SYNC_SOCKET_URL =
  import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, '') ?? 'http://localhost:3000';

// ต้องตรงกับ BrokerSyncGateway.broadcastMt5SyncUpdate() ฝั่ง backend เป๊ะ
export const MT5_SYNC_UPDATE_EVENT = 'mt5_sync_update';

export const BROKER_CONNECTION_MESSAGES = {
  loadFailed: 'ไม่สามารถโหลดรายการ broker connection ได้',
  createFailed: 'ไม่สามารถสร้าง broker connection ได้',
  revokeFailed: 'ไม่สามารถ revoke connection ได้',
  rotateFailed: 'ไม่สามารถออก API key ใหม่ได้',
  deleteFailed: 'ไม่สามารถลบ connection ได้',
} as const;

/**
 * เฉพาะ MT5 เท่านั้นที่ผู้ใช้สร้างจริงได้วันนี้ — เป็น broker เดียวที่มีทั้ง backend
 * ingest endpoint (POST /brokers/mt/ingest) และ EA connector (mt5-ea/) ทำงานจริง
 * MT4 เป็นงานของ Phase 4 ตามที่ mt4-adapter.service.ts ระบุไว้เอง, Webull ยังไม่มี OAuth
 * flow, Dime ยังไม่มี public API ให้เชื่อมต่อเลย (dime-adapter.service.ts) — แสดงไว้ให้
 * เห็น roadmap แต่ปิดปุ่มไว้ ไม่ใช่การเดา UI ของฟีเจอร์ที่ยังไม่มีอยู่จริง
 */
export const BROKER_TYPE_OPTIONS: Array<{
  value: 'MT4' | 'MT5' | 'WEBULL' | 'DIME';
  label: string;
  available: boolean;
  unavailableReason?: string;
}> = [
  { value: 'MT5', label: 'MetaTrader 5', available: true },
  { value: 'MT4', label: 'MetaTrader 4', available: false, unavailableReason: 'เร็วๆ นี้' },
  { value: 'WEBULL', label: 'Webull', available: false, unavailableReason: 'เร็วๆ นี้' },
  { value: 'DIME', label: 'Dime!', available: false, unavailableReason: 'รอ Dime! เปิด public API' },
];

export const BROKER_STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'positive',
  INACTIVE: 'grey-7',
  REVOKED: 'negative',
  ERROR: 'negative',
  DISCONNECTED: 'warning',
};

export const BROKER_STATUS_LABEL_TH: Record<string, string> = {
  ACTIVE: 'ใช้งานอยู่',
  INACTIVE: 'ไม่ได้ใช้งาน',
  REVOKED: 'ถูก revoke แล้ว',
  ERROR: 'มีปัญหา',
  DISCONNECTED: 'ขาดการเชื่อมต่อ',
};
