import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import { sql } from 'drizzle-orm';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('Settings: provider local is not a feature model (AC-44)', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('PUT /settings with feature_models provider local → 422 and settings unchanged', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });
    const before = await app.inject({ method: 'GET', url: '/settings' });
    const res = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { conventions: { provider: 'local', model: 'opus' } } },
    });
    expect(res.statusCode).toBe(422);
    const after = await app.inject({ method: 'GET', url: '/settings' });
    expect(after.json()).toEqual(before.json());
    await app.close();
  });

  it('NFR-3/AC-13: a saved Local token is never returned by the settings API nor stored in the database', async () => {
    const TOKEN = 'sentinel-it-token-777';
    const store: Record<string, string> = {};
    const secrets = {
      get: async (k: string) => store[k],
      set: async (k: string, v: string) => void (store[k] = v),
    };
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: secrets as never,
        local: { exec: async () => ({ stdout: '2.1.311 (Claude Code)\n', exitCode: 0 }) },
      },
    });
    const save = await app.inject({ method: 'POST', url: '/settings/secrets', payload: { provider: 'local', key: TOKEN } });
    expect(save.statusCode).toBe(200);
    expect(store.LOCAL_CLAUDE_OAUTH_TOKEN).toBe(TOKEN);
    for (const url of ['/settings', '/settings/secrets-status', '/settings/local-status']) {
      expect((await app.inject({ method: 'GET', url })).body).not.toContain(TOKEN);
    }
    expect(save.body).not.toContain(TOKEN);
    const rows = await pg.handle.db.execute(
      sql`select t::text as r from settings t union all select t::text from agent_runs t`,
    );
    expect(JSON.stringify(rows)).not.toContain(TOKEN);
    await app.close();
  });
});
