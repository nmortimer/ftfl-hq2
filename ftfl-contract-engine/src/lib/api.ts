import type { Contract } from './contracts';

const PASSWORD_KEY = 'ftfl:commissioner-password';

/**
 * Fetches live contracts from the backend. Returns null (not a throw) on
 * any failure — no deployed API, no KV configured, offline, whatever —
 * so callers can fall back to the bundled seed data without special-casing
 * every possible failure mode.
 */
export async function fetchContracts(): Promise<Contract[] | null> {
  try {
    const res = await fetch('/api/contracts');
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.contracts) ? data.contracts : null;
  } catch {
    return null;
  }
}

export function getStoredPassword(): string | null {
  return sessionStorage.getItem(PASSWORD_KEY);
}

export function clearStoredPassword() {
  sessionStorage.removeItem(PASSWORD_KEY);
}

/** Checks a password against the server and stores it for this tab's session if correct. */
export async function login(password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'x-commissioner-password': password },
    });
    if (res.ok) {
      sessionStorage.setItem(PASSWORD_KEY, password);
      return { ok: true };
    }
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: body.error || 'Wrong password' };
  } catch {
    return { ok: false, error: 'Could not reach the server' };
  }
}

export async function saveContracts(contracts: Contract[]): Promise<{ ok: boolean; error?: string }> {
  const password = getStoredPassword();
  if (!password) return { ok: false, error: 'Not logged in' };
  try {
    const res = await fetch('/api/contracts', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-commissioner-password': password,
      },
      body: JSON.stringify({ contracts }),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) clearStoredPassword();
    return { ok: false, error: body.error || `Save failed (${res.status})` };
  } catch {
    return { ok: false, error: 'Could not reach the server' };
  }
}

export interface FleaflickerTeamRecord {
  name: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
}

/**
 * Live standings from Fleaflicker, matched to our team slugs by name.
 * Returns null on any failure (not configured, league not found, offline)
 * so the League Summary can just show a dash instead of crashing.
 *
 * Field names (recordOverall, pointsFor, etc.) are camelCase, confirmed
 * against a real response from this league — Fleaflicker's own docs show
 * these as snake_case (record_overall) because that's the underlying
 * proto field name, but the actual JSON over the wire auto-converts to
 * camelCase. This tripped up the first version of this function.
 */
export async function fetchFleaflickerStandings(season: number): Promise<FleaflickerTeamRecord[] | null> {
  try {
    const res = await fetch(`/api/fleaflicker?endpoint=FetchLeagueStandings&season=${season}`);
    if (!res.ok) return null;
    const data = await res.json();
    const divisions = data?.divisions ?? [];
    const teams: FleaflickerTeamRecord[] = [];
    for (const division of divisions) {
      for (const entry of division.teams ?? []) {
        teams.push({
          name: entry.name ?? '',
          wins: entry.recordOverall?.wins ?? 0,
          losses: entry.recordOverall?.losses ?? 0,
          ties: entry.recordOverall?.ties ?? 0,
          pointsFor: entry.pointsFor?.value ?? 0,
        });
      }
    }
    return teams;
  } catch {
    return null;
  }
}

export interface FleaflickerActivityItem {
  raw: unknown;
  timeEpochMilli: number;
  kind: 'drop' | 'transaction' | 'unknown';
  description: string;
  teamName?: string;
  playerName?: string;
  transactionType?: string;
}

/**
 * Confirmed against a real transaction-log response from this league (not
 * guessed). Key findings that differ from what the docs alone showed:
 * - Fields are camelCase (timeEpochMilli, proPlayer, nameFull) — see the
 *   note on fetchFleaflickerStandings for why.
 * - `team` is a sibling of `transaction` on the item itself, not nested
 *   inside it.
 * - Confirmed real type value: "TRANSACTION_DROP" for a cut/drop. No
 *   confirmed example of an add came through in the sample pulled, so
 *   anything with a `type` value that ISN'T "TRANSACTION_DROP" is treated
 *   as a general transaction worth reviewing (safe default — worst case
 *   it shows up for a cost entry it doesn't need, easy to ignore).
 * - No bid/waiver-cost field appears anywhere — matches what Nick said:
 *   this league prices free agents outside Fleaflicker entirely.
 * - Some items have a player + an `owner` field but no `type` at all —
 *   these look like "this player is on X's trade block" context entries,
 *   not actual completed transactions. Treated as informational only.
 */
function parseActivityItem(item: any): FleaflickerActivityItem {
  const timeEpochMilli = Number(item?.timeEpochMilli ?? 0);
  const teamName = item?.team?.name ?? undefined;
  const t = item?.transaction;
  const playerName = t?.player?.proPlayer?.nameFull ?? undefined;
  const transactionType = t?.type ?? undefined;

  if (playerName && transactionType === 'TRANSACTION_DROP') {
    return {
      raw: item,
      timeEpochMilli,
      kind: 'drop',
      teamName,
      playerName,
      transactionType,
      description: `Dropped: ${playerName}${teamName ? ` — ${teamName}` : ''}`,
    };
  }

  if (playerName && transactionType) {
    return {
      raw: item,
      timeEpochMilli,
      kind: 'transaction',
      teamName,
      playerName,
      transactionType,
      description: `${transactionType}: ${playerName}${teamName ? ` — ${teamName}` : ''}`,
    };
  }

  return {
    raw: item,
    timeEpochMilli,
    kind: 'unknown',
    teamName,
    playerName,
    description: playerName
      ? `${playerName} — roster/trade-block info (not a confirmed transaction)${teamName ? `, ${teamName}` : ''}`
      : 'Unrecognized activity',
  };
}

export async function fetchFleaflickerActivity(): Promise<FleaflickerActivityItem[] | null> {
  try {
    const res = await fetch('/api/fleaflicker?endpoint=FetchLeagueTransactions');
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.items ?? [];
    return items.map(parseActivityItem);
  } catch {
    return null;
  }
}
