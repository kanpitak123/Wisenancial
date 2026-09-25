import { broker_connections } from '@prisma/client';

/**
 * รูปแบบ connection ที่ปลอดภัยจะส่งออกไปให้ frontend — ตัด field ที่เป็น secret ออกเสมอ
 * (api_key_hash แม้จะเป็นแค่ hash ก็ไม่ควรหลุดออกไปนอก backend, oauth token ทั้งสองตัว
 * เป็น encrypted blob ที่ไม่มีประโยชน์อะไรฝั่ง client เลยนอกจากเพิ่มพื้นที่โจมตี)
 */
export type PublicBrokerConnection = Omit<
  broker_connections,
  | 'api_key_hash'
  | 'oauth_access_token_encrypted'
  | 'oauth_refresh_token_encrypted'
>;

export function toPublicConnection(
  row: broker_connections,
): PublicBrokerConnection {
  const {
    api_key_hash: _apiKeyHash,
    oauth_access_token_encrypted: _accessToken,
    oauth_refresh_token_encrypted: _refreshToken,
    ...rest
  } = row;

  return rest;
}
