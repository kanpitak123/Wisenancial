export const GOALS_API_PATH = '/goals';

export const GOAL_MESSAGES = {
  portfolioRequired: 'ยังไม่ได้เลือก Portfolio',
  loadFailed: 'ไม่สามารถโหลดเป้าหมายได้',
  saveFailed: 'ไม่สามารถบันทึกเป้าหมายได้',
} as const;

export const GOAL_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
