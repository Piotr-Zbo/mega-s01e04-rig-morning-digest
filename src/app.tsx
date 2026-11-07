import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestPage } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

function isMissingFile(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const { night } = c.req.param();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return c.text('Not Found', 404);

    try {
      return c.html(
        <Layout title={`digest · ${night}`} lane={lane()}>
          <DigestPage night={night} result={readNight(config.runsDir, night)} />
        </Layout>,
      );
    } catch (error) {
      if (isMissingFile(error)) return c.text('Not Found', 404);
      throw error;
    }
  });

  app.get('/api/digest/:night', (c) => {
    const { night } = c.req.param();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return c.text('Not Found', 404);

    try {
      const result = readNight(config.runsDir, night);
      return c.json({
        ...result,
        rows: [...result.rows].sort((a, b) => a.job.localeCompare(b.job)),
      });
    } catch (error) {
      if (isMissingFile(error)) return c.text('Not Found', 404);
      throw error;
    }
  });

  return app;
}
