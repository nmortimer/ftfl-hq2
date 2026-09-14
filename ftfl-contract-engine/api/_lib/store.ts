// Contracts now live in Vercel KV (Redis) once deployed — realContracts.ts
// is only the SEED data, used the very first time the KV key is empty.
// After that, KV is the source of truth; the commissioner screen writes
// here, not to the generated file.
import { kv } from '@vercel/kv';
import { realContracts } from '../../src/data/realContracts';
import type { Contract } from '../../src/lib/contracts';

const KEY = 'ftfl:contracts';

export async function getAllContracts(): Promise<Contract[]> {
  try {
    const stored = await kv.get<Contract[]>(KEY);
    if (stored && Array.isArray(stored) && stored.length > 0) {
      return stored;
    }
  } catch (err: any) {
    // KV not configured (e.g. running without a linked Vercel KV store) —
    // fall through to seed data so the app still works read-only.
    console.error('KV read failed, falling back to seed data:', err?.message);
  }
  return realContracts;
}

export async function saveAllContracts(contracts: Contract[]): Promise<Contract[]> {
  if (!Array.isArray(contracts)) {
    throw new Error('contracts must be an array');
  }
  await kv.set(KEY, contracts);
  return contracts;
}
