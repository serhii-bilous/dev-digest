import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('Agents: provider local + alias-only models (AC-9, AC-10)', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const base = { name: 'Local agent', system_prompt: 'review' };

  it('create + update round-trip with an alias; non-alias is rejected and nothing changes', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });
    const bad = await app.inject({ method: 'POST', url: '/agents', payload: { ...base, provider: 'local', model: 'gpt-4.1' } });
    expect(bad.statusCode).toBe(422);

    const created = await app.inject({ method: 'POST', url: '/agents', payload: { ...base, provider: 'local', model: 'opus' } });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;

    const ok = await app.inject({ method: 'PUT', url: `/agents/${id}`, payload: { model: 'sonnet' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ provider: 'local', model: 'sonnet' });

    // Full body and model-only PUTs with a non-alias model are both rejected.
    for (const payload of [{ provider: 'local', model: 'gpt-4.1' }, { model: 'gpt-4.1' }]) {
      const r = await app.inject({ method: 'PUT', url: `/agents/${id}`, payload });
      expect(r.statusCode).toBe(422);
    }
    expect((await app.inject({ method: 'GET', url: `/agents/${id}` })).json()).toMatchObject({
      provider: 'local',
      model: 'sonnet',
    });
    await app.close();
  });

  it('PUT provider:local alone on an agent with a non-alias stored model is rejected', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });
    const created = await app.inject({ method: 'POST', url: '/agents', payload: { ...base, provider: 'openai', model: 'gpt-4.1' } });
    const id = created.json().id as string;
    const r = await app.inject({ method: 'PUT', url: `/agents/${id}`, payload: { provider: 'local' } });
    expect(r.statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: `/agents/${id}` })).json()).toMatchObject({
      provider: 'openai',
      model: 'gpt-4.1',
    });
    await app.close();
  });
});
