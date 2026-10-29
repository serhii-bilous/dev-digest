import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPgUpTo, dockerAvailable } from './helpers/pg.js';
import { runMigrations } from '../src/db/migrate.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[stack-aware-migration] Docker not available — skipping integration tests.');
}

/**
 * Migration 0018 (stack-aware backfill) on a DB that already holds live data:
 * DDL 0017 applied, fixtures inserted, then the full migrator runs.
 */
d('stack-aware migration 0017/0018', () => {
  let pg: Awaited<ReturnType<typeof startPgUpTo>>;
  const ids: Record<string, string> = {};

  const states = async (agentName: string) =>
    pg.sql<{ repo_id: string; active: boolean }[]>`
      SELECT s.repo_id, s.active FROM repo_agent_states s
      JOIN agents a ON a.id = s.agent_id WHERE a.name = ${agentName} ORDER BY s.repo_id`;
  const langs = async (name: string) =>
    (await pg.sql<{ languages: unknown }[]>`SELECT languages FROM agents WHERE name = ${name}`)[0]!
      .languages;

  beforeAll(async () => {
    pg = await startPgUpTo('0017');
    const sql = pg.sql;
    const [ws] = await sql<{ id: string }[]>`INSERT INTO workspaces (name) VALUES ('w') RETURNING id`;
    const [ws2] = await sql<{ id: string }[]>`INSERT INTO workspaces (name) VALUES ('w2') RETURNING id`;
    for (const [k, w, n] of [['r1', ws!.id, 'a'], ['r2', ws!.id, 'b'], ['rOther', ws2!.id, 'c']] as const) {
      const [r] = await sql<{ id: string }[]>`
        INSERT INTO repos (workspace_id, owner, name, full_name) VALUES (${w}, 'o', ${n}, ${'o/' + n}) RETURNING id`;
      ids[k] = r!.id;
    }
    ids.ws = ws!.id;
    const agent = async (name: string, enabled: boolean, prompt = 'p') => {
      const [a] = await sql<{ id: string }[]>`
        INSERT INTO agents (workspace_id, name, provider, model, system_prompt, enabled)
        VALUES (${ws!.id}, ${name}, 'openai', 'm', ${prompt}, ${enabled}) RETURNING id`;
      ids[name] = a!.id;
    };
    await agent('General Reviewer', true);
    await agent('Security Reviewer (Python)', true, 'ORIGINAL PY PROMPT');
    await agent('Disabled Custom', false);
    await agent('Renamed Security', true);
    await agent('Custom Enabled', true);

    await runMigrations(pg.url);
  }, 180_000);

  afterAll(async () => {
    await pg?.stop();
  });

  it('disabled agent -> inactive on every repo of its workspace; enabled -> active (AC-19)', async () => {
    const dis = await states('Disabled Custom');
    expect(dis).toHaveLength(2);
    expect(dis.every((s) => s.active === false)).toBe(true);
    const en = await states('Custom Enabled');
    expect(en).toHaveLength(2);
    expect(en.every((s) => s.active === true)).toBe(true);
    // cross-workspace repo gets no row
    expect(en.map((s) => s.repo_id)).not.toContain(ids.rOther);
  });

  it('built-ins get their language lists; renamed/custom stay NULL (AC-53)', async () => {
    expect(await langs('General Reviewer')).toEqual(['TypeScript', 'JavaScript']);
    expect(await langs('Security Reviewer (Python)')).toEqual(['Python']);
    expect(await langs('Renamed Security')).toBeNull();
    expect(await langs('Custom Enabled')).toBeNull();
    expect(await langs('Disabled Custom')).toBeNull();
  });

  it('keeps the original prompt of the Python built-in (AC-47a)', async () => {
    const [row] = await pg.sql<{ system_prompt: string }[]>`
      SELECT system_prompt FROM agents WHERE name = 'Security Reviewer (Python)'`;
    expect(row!.system_prompt).toBe('ORIGINAL PY PROMPT');
  });

  it('agents.enabled column is kept', async () => {
    const cols = await pg.sql`SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='enabled'`;
    expect(cols).toHaveLength(1);
  });

  it('re-running the migrator is idempotent', async () => {
    const before = await pg.sql`SELECT count(*)::int AS n FROM repo_agent_states`;
    await runMigrations(pg.url);
    const after = await pg.sql`SELECT count(*)::int AS n FROM repo_agent_states`;
    expect(after[0]!.n).toBe(before[0]!.n);
  });

  it('deleting a repo or an agent cascades its repo_agent_states rows (AC-24)', async () => {
    await pg.sql`DELETE FROM repos WHERE id = ${ids.r1!}`;
    expect(await pg.sql`SELECT 1 FROM repo_agent_states WHERE repo_id = ${ids.r1!}`).toHaveLength(0);
    await pg.sql`DELETE FROM agents WHERE id = ${ids['Custom Enabled']!}`;
    expect(
      await pg.sql`SELECT 1 FROM repo_agent_states WHERE agent_id = ${ids['Custom Enabled']!}`,
    ).toHaveLength(0);
    const orphans = await pg.sql`
      SELECT 1 FROM repo_agent_states s
      WHERE NOT EXISTS (SELECT 1 FROM repos r WHERE r.id = s.repo_id)
         OR NOT EXISTS (SELECT 1 FROM agents a WHERE a.id = s.agent_id)`;
    expect(orphans).toHaveLength(0);
  });
});
