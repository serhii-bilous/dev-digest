import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[seed-stack-aware] Docker not available — skipping.');

const TS = ['General Reviewer', 'Security Reviewer', 'Performance Reviewer', 'Test Quality Reviewer'];
const PY = TS.map((n) => `${n} (Python)`);

d('seed — stack-aware built-ins', () => {
  let pg: PgFixture;
  let db: PgFixture['handle']['db'];
  let defaultWs: string;
  let otherWs: string;

  beforeAll(async () => {
    pg = await startPg();
    db = pg.handle.db;
    // Pre-existing API-created agents in the default workspace, before the first seed.
    const r = await seed(db);
    defaultWs = r.workspaceId;
    await db.delete(t.agents).where(eq(t.agents.workspaceId, defaultWs)); // back to a clean slate
    const [ws2] = await db.insert(t.workspaces).values({ name: 'second' }).returning();
    otherWs = ws2!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const agentsOf = (ws: string) => db.select().from(t.agents).where(eq(t.agents.workspaceId, ws));

  it('fresh seed declares languages; two workspaces x two runs -> one row per built-in name', async () => {
    const [u] = await db.select().from(t.users);
    await db.insert(t.agents).values([
      { workspaceId: defaultWs, name: 'General Reviewer (Python)', provider: 'openrouter', model: 'm', systemPrompt: 'ORIGINAL', createdBy: u!.id, languages: null },
      { workspaceId: defaultWs, name: 'Security Reviewer (Python)', provider: 'openrouter', model: 'm', systemPrompt: 'X', createdBy: u!.id, languages: ['Python', 'Go'] },
    ]);
    await seed(db);
    await seed(db);
    for (const ws of [defaultWs, otherWs]) {
      const rows = await agentsOf(ws);
      for (const n of [...TS, ...PY]) expect(rows.filter((r) => r.name === n)).toHaveLength(1);
    }
    const other = await agentsOf(otherWs);
    for (const n of TS) expect(other.find((r) => r.name === n)!.languages).toEqual(['TypeScript', 'JavaScript']);
    for (const n of PY) expect(other.find((r) => r.name === n)!.languages).toEqual(['Python']);
  });

  it('pre-existing Python agent keeps its prompt; any -> [Python]; [Python, Go] untouched', async () => {
    const rows = await agentsOf(defaultWs);
    const gen = rows.find((r) => r.name === 'General Reviewer (Python)')!;
    expect(gen.systemPrompt).toBe('ORIGINAL');
    expect(gen.languages).toEqual(['Python']);
    expect(rows.find((r) => r.name === 'Security Reviewer (Python)')!.languages).toEqual(['Python', 'Go']);
  });

  it('seed-created Python agents have no state rows; Test Quality (Python) links pr-quality-rubric only', async () => {
    const rows = await agentsOf(otherWs);
    const states = await db.select().from(t.repoAgentStates);
    const pyIds = rows.filter((r) => PY.includes(r.name)).map((r) => r.id);
    expect(states.filter((s) => pyIds.includes(s.agentId))).toHaveLength(0);
    const tq = rows.find((r) => r.name === 'Test Quality Reviewer (Python)')!;
    const links = await db
      .select({ name: t.skills.name })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(eq(t.agentSkills.agentId, tq.id));
    expect(links.map((l) => l.name)).toEqual(['pr-quality-rubric']);
  });
});

d('seed — demo repo activation', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('fresh DB: four active TS/JS built-ins on the demo repo; removed one stays removed', async () => {
    const db = pg.handle.db;
    const { workspaceId } = await seed(db);
    const [repo] = await db.select().from(t.repos).where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    const states = await db.select().from(t.repoAgentStates).where(eq(t.repoAgentStates.repoId, repo!.id));
    expect(states).toHaveLength(4);
    expect(states.every((s) => s.active)).toBe(true);
    const agents = await db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
    const names = new Set(states.map((s) => agents.find((a) => a.id === s.agentId)!.name));
    expect(names).toEqual(new Set(TS));

    await db.update(t.repoAgentStates).set({ active: false }).where(eq(t.repoAgentStates.agentId, states[0]!.agentId));
    await db.delete(t.repoAgentStates).where(eq(t.repoAgentStates.agentId, states[1]!.agentId));
    await seed(db);
    const after = await db.select().from(t.repoAgentStates).where(eq(t.repoAgentStates.repoId, repo!.id));
    expect(after).toHaveLength(3);
    expect(after.find((s) => s.agentId === states[0]!.agentId)!.active).toBe(false);
  });
});
