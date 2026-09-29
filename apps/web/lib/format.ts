const E18 = 10n ** 18n;

/** Raw 18-decimal amount (bigint or decimal string) → "12,345.67". */
export function tokens(raw: bigint | string, decimals = 2): string {
  const v = typeof raw === 'bigint' ? raw : BigInt(raw);
  const whole = v / E18;
  const frac = ((v % E18) * 10n ** BigInt(decimals)) / E18;
  const w = whole.toLocaleString('en-US');
  return decimals ? `${w}.${frac.toString().padStart(decimals, '0')}` : w;
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

export const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(3)}`;

export function date(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

/** Plain-language labels for reason codes. */
export const REASON_LABELS: Record<string, string> = {
  HOLD_SCOUT_DROPS: 'Held past Scout airdrops',
  HOLD_GRAD_POSITIONS: 'Held graduated positions',
  HOLD_PRIOR: 'Baseline (thin hold history)',
  HOLD_CAP: 'Hold score cap',
  MARKET_QUALITY_MIX: 'Trades substance lanes',
  LANE_AFFINITY: 'Fits this launch',
  MARKET_PRIOR: 'Baseline (thin trading history)',
  MARKET_CAP: 'Market score cap',
  VIBER_CHARGED: 'Charged Vibe Viber',
  VIBER_HELD: 'Holds a Viber (not charged)',
  GUILD_GOOD_STANDING: 'Guild in good standing',
  SHIPPED_SUBSTANCE: 'Shipped a product that graduated',
  CREATOR_RUG: 'Created a flagged launch',
  ALIGNMENT_CAP: 'Alignment cap',
  DUMPED_1H_LAST_DROP: 'Dumped the last drop within 1h',
  DUMP_LAST_DROP: 'Sold part of the last drop',
  DUMP_HISTORY: 'Sold earlier drops',
  DUMP_CAP: 'Dump score cap',
  SYBIL_CLUSTER: 'Linked to other wallets by funding or trades',
};

export function reasonLabel(code: string): string {
  if (REASON_LABELS[code]) return REASON_LABELS[code];
  const spark = /^SPARK_(.+)$/.exec(code);
  if (spark) return `Holds ${spark[1]}+ SPARK`;
  return code;
}
