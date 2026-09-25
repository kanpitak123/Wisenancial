/**
 * Real, gated-beta MT5 investor-password connector — see
 * docs/mt5-investor-password-spike.md, "Beta graduation work". Distinct from
 * src/services/mt5-cloud-spike.service.ts (the dev-only /dev/mt5-cloud-spike surface,
 * untouched by this).
 */

export const MT5_CLOUD_CONNECTOR_API_PATH = '/brokers/mt5-cloud-connector';

/** How often the detail view polls while open — well under the backend's default
 * 5-minute idle-undeploy threshold so normal viewing never triggers an idle undeploy.
 * Each poll is also what keeps the MetaApi account's on-demand deploy alive; stopping
 * the poll (navigating away, closing the tab) is what lets it go idle and get
 * undeployed. See mt5-cloud-spike/deploy-idle.constants.ts on the backend. */
export const MT5_CLOUD_CONNECTOR_POLL_INTERVAL_MS = 60_000;

export interface Mt5BrokerPreset {
  value: string;
  label: string;
  /** Pre-fills the server field as a starting suggestion only — always free-text /
   * overridable, since exact demo vs. real server names vary a lot per broker and even
   * per account within the same broker. */
  serverPattern: string;
}

/** "Other broker" always leaves the server field blank — exact names outside this short
 * list vary too much to guess at. */
export const MT5_BROKER_PRESETS: Mt5BrokerPreset[] = [
  { value: 'exness', label: 'Exness', serverPattern: 'Exness-MT5Trial' },
  { value: 'ic-markets', label: 'IC Markets', serverPattern: 'ICMarkets-Demo' },
  { value: 'xm-global', label: 'XM Global', serverPattern: 'XMGlobal-Demo' },
  { value: 'pepperstone', label: 'Pepperstone', serverPattern: 'Pepperstone-Demo' },
  { value: 'ftmo', label: 'FTMO', serverPattern: 'FTMO-Demo' },
  { value: 'other', label: 'อื่นๆ (Other)', serverPattern: '' },
];

/**
 * DRAFT — pending legal/product sign-off. Do not treat as final PDPA consent copy; see
 * docs/mt5-investor-password-spike.md, "Beta graduation work" for the three business
 * decisions this whole feature is still gated on, including this text.
 */
export const MT5_CLOUD_CONNECTOR_CONSENT_TEXT_DRAFT =
  'รหัสผ่านนักลงทุน (investor password) ของคุณจะถูกเข้ารหัสและส่งไปยัง MetaApi.cloud ' +
  'ซึ่งเป็นผู้ให้บริการที่โฮสต์อยู่ต่างประเทศ เพื่อดึงข้อมูลบัญชีของคุณแบบอ่านอย่างเดียว (read-only) ' +
  'Wisenancial ไม่เก็บรหัสผ่านนี้เป็น plaintext และไม่มีสิทธิ์สั่งซื้อขายผ่านการเชื่อมต่อนี้ ' +
  'กด "ยินยอม" เพื่อดำเนินการต่อ';
