/**
 * Wording for the flat AI price shown on buttons and in "not enough credits" hints.
 * The number itself always comes from the backend (AiStore.costOf), never from here.
 */

/** " · 20 credits" / " · 20 เครดิต" for a button label; empty until the price is known. */
export function aiCostSuffix(credits: number | null, isThai: boolean): string {
  if (credits === null) return '';

  return ` · ${credits} ${isThai ? 'เครดิต' : credits === 1 ? 'credit' : 'credits'}`;
}

/** Why a paid AI button is disabled because the balance is too low. */
export function aiNotEnoughCreditsMessage(
  balance: number,
  required: number,
  isThai: boolean,
): string {
  return isThai
    ? `เครดิต AI ไม่พอ (มี ${balance} ต้องใช้ ${required}) — เติมเครดิตก่อนใช้งาน`
    : `Not enough AI credits (${balance} of ${required} required). Top up to continue.`;
}
