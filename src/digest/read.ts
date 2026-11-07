import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, ReadNight, ReadNightResult } from './types.js';

type RunRecord = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseRunRecord(line: string): RunRecord | null {
  let value: unknown;

  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }

  if (!isRecord(value)) return null;
  if (typeof value.at !== 'string' || typeof value.job !== 'string') return null;
  if (value.job.length === 0) return null;
  if (value.status !== 'ok' && value.status !== 'retry' && value.status !== 'fail') return null;
  if (value.owner !== null && typeof value.owner !== 'string') return null;
  if (value.error !== undefined && typeof value.error !== 'string') return null;

  return {
    at: value.at,
    job: value.job,
    status: value.status,
    owner: value.owner,
    error: value.error ?? null,
  };
}

export const readNight: ReadNight = (runsDir, night): ReadNightResult => {
  const contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  const rowsByJob = new Map<string, DigestRow>();
  let malformedLines = 0;

  for (const line of contents.split(/\r?\n/)) {
    if (line.trim() === '') continue;

    const record = parseRunRecord(line);
    if (!record) {
      malformedLines += 1;
      continue;
    }

    const row = rowsByJob.get(record.job);
    if (row) {
      row.runs += 1;
      if (record.status === 'retry') row.retries += 1;
      row.lastStatus = record.status;
      if (record.error !== null) row.lastError = record.error;
      row.lastAt = record.at;
      continue;
    }

    rowsByJob.set(record.job, {
      job: record.job,
      owner: record.owner,
      runs: 1,
      retries: record.status === 'retry' ? 1 : 0,
      lastStatus: record.status,
      lastError: record.error,
      firstAt: record.at,
      lastAt: record.at,
    });
  }

  return { rows: [...rowsByJob.values()], malformedLines };
};
