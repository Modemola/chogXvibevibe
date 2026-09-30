import {
  AFTERMATH_WINDOWS,
  type Address,
  type AftermathDrop,
  type SoldByWindow,
  type TokenTransfer,
  type WindowSummary,
  measureDrop,
  summarizeAftermath,
} from '@scout/core';
import type { Db } from './client.js';

export interface AftermathRun {
  now: number;
  /** Drops with at least one window due. */
  due: number;
  measured: number;
  /** Drop transfer not found in indexed transfers (not indexed yet, or sent some other way). */
  unobserved: number;
  windowsWritten: number;
}

/** Latest indexed transfer time. Windows are only closed up to here, so indexer lag can't fake a hold. */
export async function transfersHead(db: Db): Promise<number | undefined> {
  const [row] = await db.query<{ t: string | null }>('SELECT max(ts) AS t FROM transfers');
  return row?.t ? Number(row.t) : undefined;
}

const elapsedWindows = (receivedAt: number, now: number) => AFTERMATH_WINDOWS.filter(([, len]) => receivedAt + len <= now).length;

/**
 * Measures every Scout drop that has a window due and not yet recorded, and
 * writes drop_outcomes. Idempotent: re-running with the same data writes the
 * same numbers. Run it on a schedule (e.g. every 10 minutes).
 */
export async function runAftermath(db: Db, opts: { now?: number } = {}): Promise<AftermathRun> {
  const now = opts.now ?? (await transfersHead(db)) ?? 0;
  const run: AftermathRun = { now, due: 0, measured: 0, unobserved: 0, windowsWritten: 0 };

  const rows = await db.query<{
    launch_id: string;
    wallet: string;
    amount: string;
    received_at: string;
    token: string;
    measured: number;
  }>(
    `SELECT d.launch_id, d.wallet, d.amount::text AS amount, d.received_at, l.token,
            (SELECT count(*)::int FROM drop_outcomes o WHERE o.launch_id = d.launch_id AND o.wallet = d.wallet) AS measured
       FROM scout_drops d JOIN launches l ON l.id = d.launch_id
      WHERE d.received_at + 3600 <= $1
      ORDER BY d.launch_id, d.wallet`,
    [now],
  );
  const due = rows.filter((r) => elapsedWindows(Number(r.received_at), now) > Number(r.measured));
  run.due = due.length;
  if (!due.length) return run;

  const holds = (await db.query<{ address: string }>('SELECT address FROM hold_contracts')).map((r) => r.address as Address);

  // Declared links: a holder is a primary plus all its alts.
  const links = await db.query<{ wallet: string; primary_wallet: string }>('SELECT wallet, primary_wallet FROM wallet_links');
  const primaryOf = new Map(links.map((l) => [l.wallet, l.primary_wallet]));
  const altsOf = new Map<string, string[]>();
  for (const l of links) altsOf.set(l.primary_wallet, [...(altsOf.get(l.primary_wallet) ?? []), l.wallet]);
  const holderOf = (w: string): Address[] => {
    const primary = primaryOf.get(w) ?? w;
    return [primary, ...(altsOf.get(primary) ?? [])] as Address[];
  };

  const byLaunch = new Map<string, typeof due>();
  for (const r of due) byLaunch.set(r.launch_id, [...(byLaunch.get(r.launch_id) ?? []), r]);

  for (const [launchId, drops] of byLaunch) {
    const token = drops[0]!.token;
    const addresses = [...new Set(drops.flatMap((d) => holderOf(d.wallet)))];
    const transfers = (
      await db.query<{ tx_hash: string; log_index: number; from: string; to: string; amount: string; ts: string }>(
        `SELECT tx_hash, log_index, "from", "to", amount::text AS amount, ts FROM transfers
          WHERE token = $1 AND ts <= $2 AND ("from" = ANY($3::text[]) OR "to" = ANY($3::text[]))`,
        [token, now, addresses],
      )
    ).map(
      (t): TokenTransfer => ({
        txHash: t.tx_hash,
        logIndex: Number(t.log_index),
        from: t.from as Address,
        to: t.to as Address,
        amount: BigInt(t.amount),
        ts: Number(t.ts),
      }),
    );

    const outcomes: { wallet: string; window: string; bps: number }[] = [];
    for (const d of drops) {
      const holder = holderOf(d.wallet);
      const members = new Set<string>(holder);
      const result = measureDrop({
        wallet: d.wallet as Address,
        amount: BigInt(d.amount),
        receivedAt: Number(d.received_at),
        transfers: transfers.filter((t) => members.has(t.from) || members.has(t.to)),
        linked: holder.filter((w) => w !== d.wallet),
        holdContracts: holds,
        asOf: now,
      });
      if (!result.observed) {
        run.unobserved++;
        continue;
      }
      run.measured++;
      for (const [window, bps] of Object.entries(result.sold)) outcomes.push({ wallet: d.wallet, window, bps });
    }
    if (outcomes.length) {
      await db.query(
        `INSERT INTO drop_outcomes (launch_id, wallet, "window", sold_bps, measured_at)
         SELECT $1::text, w, win, bps, $5::bigint FROM unnest($2::text[], $3::text[], $4::integer[]) AS u(w, win, bps)
         ON CONFLICT (launch_id, wallet, "window") DO UPDATE SET sold_bps = EXCLUDED.sold_bps, measured_at = EXCLUDED.measured_at`,
        [launchId, outcomes.map((o) => o.wallet), outcomes.map((o) => o.window), outcomes.map((o) => o.bps), now],
      );
      run.windowsWritten += outcomes.length;
    }
  }
  return run;
}

export interface LaunchAftermath {
  launchId: string;
  recipients: (AftermathDrop & { receivedAt: number })[];
  windows: WindowSummary[];
}

/** Recorded outcomes for one launch, plus the per-window summary. */
export async function loadLaunchAftermath(db: Db, launchId: string): Promise<LaunchAftermath> {
  const rows = await db.query<{ wallet: string; amount: string; received_at: string; window: keyof SoldByWindow | null; sold_bps: number | null }>(
    `SELECT d.wallet, d.amount::text AS amount, d.received_at, o."window", o.sold_bps
       FROM scout_drops d LEFT JOIN drop_outcomes o ON o.launch_id = d.launch_id AND o.wallet = d.wallet
      WHERE d.launch_id = $1 ORDER BY d.wallet`,
    [launchId],
  );
  const byWallet = new Map<string, AftermathDrop & { receivedAt: number }>();
  for (const r of rows) {
    const d = byWallet.get(r.wallet) ?? { wallet: r.wallet as Address, amount: BigInt(r.amount), receivedAt: Number(r.received_at), sold: {} };
    if (r.window) d.sold[r.window] = Number(r.sold_bps);
    byWallet.set(r.wallet, d);
  }
  const recipients = [...byWallet.values()];
  return { launchId, recipients, windows: summarizeAftermath(recipients) };
}
