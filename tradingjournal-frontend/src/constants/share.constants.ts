import type { ShareContentType, SharePlatform } from '../types/share.types';

export const SHARE_API_PATH = '/share-statistics';

export const SHARE_PLATFORMS: readonly SharePlatform[] = [
  'twitter',
  'facebook',
  'linkedin',
  'download',
  'copy_link',
];

export const SOCIAL_SHARE_PLATFORMS: readonly SharePlatform[] = ['twitter', 'facebook', 'linkedin'];

export const SHARE_CONTENT_TYPES: readonly ShareContentType[] = ['MESSAGE', 'IMAGE', 'LINK'];

export const DEFAULT_SHARE_LOG_LIMIT = 20;

export const MAX_SHARE_LOG_LIMIT = 100;

export const SHARE_MESSAGES = {
  portfolioRequired: 'ยังไม่ได้เลือก Portfolio',
  statisticsFailed: 'ไม่สามารถโหลดข้อมูลสำหรับแชร์ได้',
  messageFailed: 'ไม่สามารถสร้างข้อความแชร์ได้',
  imageFailed: 'ไม่สามารถสร้างรูปสำหรับแชร์ได้',
  socialDataFailed: 'ไม่สามารถโหลดข้อมูล Social Share ได้',
  logFailed: 'ไม่สามารถบันทึกประวัติการแชร์ได้',
  logsFailed: 'ไม่สามารถโหลดประวัติการแชร์ได้',
} as const;
