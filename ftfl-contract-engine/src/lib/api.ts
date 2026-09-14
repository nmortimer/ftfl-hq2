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
 * Field names below (record_overall, points_for, etc.) are confirmed
 * against Fleaflicker's official API docs (fleaflicker.com/api-docs) —
 * this is the real response shape, not a guess.
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
          wins: entry.record_overall?.wins ?? 0,
          losses: entry.record_overall?.losses ?? 0,
          ties: entry.record_overall?.ties ?? 0,
          pointsFor: entry.points_for?.value ?? 0,
        });
      }
    }
    return teams;
  } catch {
    return null;
  }
}
