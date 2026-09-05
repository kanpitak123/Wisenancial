export const BROKER_CONNECTIONS_API_PATH = '/brokers/connections';

/** ต้องตรงกับ path ที่ประกาศใน router/routes.ts เป๊ะ ('BrokerConnections' ใต้ MainLayout ที่ path root '/') */
export const BROKER_CONNECTIONS_ROUTE = '/BrokerConnections';

/** query param ที่ /BrokerConnections อ่านเพื่อ pre-select portfolio ในฟอร์มสร้าง connection หรือ scroll ไปหา connection ที่ผูกกับ portfolio นั้นอยู่แล้ว — ตั้งชื่อโดย PortfolioPage.vue ตอน navigate มา */
export const BROKER_CONNECTIONS_PORTFOLIO_QUERY_PARAM = 'portfolio_id';

// เหมือน NEWS_SOCKET_URL (news.constants.ts) เป๊ะ — แกะ /api ท้าย URL ออกเพราะ
// socket.io ต่อที่ root ของ backend ไม่ใช่ prefix เดียวกับ REST
export const BROKER_SYNC_SOCKET_URL =
  import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, '') ?? 'http://localhost:3000';

/**
 * ค่าเดียวกับ BROKER_SYNC_SOCKET_URL เป๊ะ (backend origin ไม่มี /api ต่อท้าย) — คนละชื่อ
 * เพราะคนละความหมาย: ตัวนี้คือค่าที่ผู้ใช้ต้องกรอกเป็น EA's InpApiBaseUrl input *และ*
 * ต้องไปใส่ใน MT5 Tools → Options → Expert Advisors → "Allow WebRequest for listed URL"
 * เป๊ะๆ ตัวเดียวกัน (ดู docs/mt5-ea-setup.md §3/§5) — ConnectMt5Wizard แสดงค่านี้ให้ผู้ใช้
 * copy โดยตรง ไม่ให้พิมพ์เองเด็ดขาด (พิมพ์ผิดหนึ่งตัวอักษรก็ทำให้ MT5 ปฏิเสธ WebRequest แบบ
 * เงียบๆ ได้)
 */
export const MT5_EA_API_BASE_URL = BROKER_SYNC_SOCKET_URL;

// ไฟล์ .ex5 ที่ compile ไว้แล้ว เสิร์ฟเป็น static asset ตรงๆ จาก public/ (Quasar copy
// ทั้งโฟลเดอร์ไปที่ root ของ build ให้เอง) — ไม่ผ่าน backend เลยเพราะไม่ใช่ความลับอะไร
// (ตัวไฟล์เดียวกับที่ commit ไว้ใน mt5-ea/WisenancialMT5EA.ex5 ที่ repo root)
export const MT5_EA_DOWNLOAD_PATH = '/downloads/WisenancialMT5EA.ex5';
export const MT5_EA_DOWNLOAD_FILENAME = 'WisenancialMT5EA.ex5';

// path ที่ผู้ใช้ต้องวางไฟล์ .ex5 ไว้ — MetaTrader 5 อ่านจากตรงนี้เท่านั้น (เข้าถึงผ่าน
// File → Open Data Folder ในตัวโปรแกรม MT5 เอง เบราว์เซอร์ไม่มีทางรู้ path จริงบนเครื่อง
// ผู้ใช้ได้ ปุ่ม "copy path" ในตัว wizard จึงแค่ copy string นี้ไปเป็นข้อความอ้างอิง)
export const MT5_EA_EXPERTS_FOLDER = 'MQL5\\Experts';

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

/**
 * คำอธิบายภาษาคนของ last_error_code (Mt5IngestErrorCode ฝั่ง backend) — ใช้ในขั้นตอนที่ 5
 * ของ ConnectMt5Wizard แทนที่จะโชว์แค่ last_error_message ดิบๆ (ซึ่งเป็นข้อความสำหรับ debug
 * ไม่ใช่ผู้ใช้ทั่วไป) วางไว้ที่นี่แทนไฟล์ backend เพราะเป็นเรื่อง presentation ล้วนๆ
 */
export const MT5_INGEST_ERROR_LABEL_TH: Record<string, string> = {
  ACCOUNT_MISMATCH: 'บัญชี MT5 ที่ EA ต่ออยู่ไม่ตรงกับบัญชีที่เคยเชื่อมกับ API key นี้ครั้งแรก',
  PORTFOLIO_NOT_BOUND: 'Connection นี้ยังไม่ได้ผูกกับ Portfolio',
  CONFIG_ERROR: 'MT5 ส่งข้อมูลมาในรูปแบบที่ backend ไม่ยอมรับ',
};
