import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow, ReadNightResult } from '../src/digest/types.js';

const night = '2026-10-28';

let runsDir: string;

function writeNight(date: string, contents: string): void {
  writeFileSync(join(runsDir, `${date}.jsonl`), contents, 'utf8');
}

function rowsShownOnPage(html: string): string[][] {
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
  if (body === undefined) return [];

  return [...body.matchAll(/<tr(?: class="[^"]*")?>([\s\S]*?)<\/tr>/g)].map(([, row]) =>
    [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, cell]) => cell),
  );
}

function rowCells(row: DigestRow): string[] {
  return [
    row.job,
    row.owner ?? '—',
    String(row.runs),
    String(row.retries),
    row.lastStatus,
    row.lastError ?? '—',
    row.firstAt,
    row.lastAt,
  ];
}

const config = () => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
});

describe('digest routes', () => {
  beforeEach(() => {
    runsDir = mkdtempSync(join(process.cwd(), 'issue-6-runs-'));
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  it('serves sorted digest rows and the malformed-line count on the page and JSON route', async () => {
    writeNight(
      night,
      [
        '{"at":"2026-10-28T02:00:00+01:00","job":"zebra/task","status":"ok","owner":"rook"}',
        '{"at":"2026-10-28T01:00:00+01:00","job":"alpha/task","status":"retry","owner":null,"error":"upstream 503"}',
        '{malformed line',
      ].join('\n'),
    );

    const app = createApp(config());
    const pageResponse = await app.request(`/digest/${night}`);
    const page = await pageResponse.text();
    const jsonResponse = await app.request(`/api/digest/${night}`);
    const result = (await jsonResponse.json()) as ReadNightResult;

    expect(pageResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(page).toContain('malformed lines: 1');
    expect(result.malformedLines).toBe(1);
    expect(result.rows.map((row) => row.job)).toEqual(['alpha/task', 'zebra/task']);
    expect(rowsShownOnPage(page)).toEqual(result.rows.map(rowCells));
  });

  it('returns 404 for a missing night on both routes', async () => {
    const app = createApp(config());

    expect((await app.request('/digest/2026-10-29')).status).toBe(404);
    expect((await app.request('/api/digest/2026-10-29')).status).toBe(404);
  });

  it('shows nothing ran for an empty night file', async () => {
    const emptyNight = '2026-10-30';
    writeNight(emptyNight, '');
    const app = createApp(config());

    const pageResponse = await app.request(`/digest/${emptyNight}`);
    const page = await pageResponse.text();
    const jsonResponse = await app.request(`/api/digest/${emptyNight}`);
    const result = (await jsonResponse.json()) as ReadNightResult;

    expect(pageResponse.status).toBe(200);
    expect(page).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    expect(result).toEqual({ rows: [], malformedLines: 0 });
  });
});
