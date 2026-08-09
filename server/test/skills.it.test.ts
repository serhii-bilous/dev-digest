import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsService } from '../src/modules/skills/service.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';
import type { Container } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills CRUD + version history + markdown-file import (L02). Mirrors
 * agents-versions.it.test.ts's shape: a fresh skill has v1, a body edit
 * appends v2 (newest-first), enabled-only toggles don't version-bump, and the
 * 404s (unknown skill, unknown version, cross-workspace).
 */
d('skills module', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'pr-quality-rubric-2',
    description: 'A test skill.',
    type: 'rubric' as const,
    body: '# Rule\nDescribe the rule.',
  };

  it('CRUD round-trip', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({
      name: createBody.name,
      type: 'rubric',
      source: 'manual',
      enabled: true,
      version: 1,
    });

    const got = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().body).toBe(createBody.body);

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: '# Rule v2\nUpdated.' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);

    const deleted = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(deleted.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('a body/name/description/type edit bumps version; enabled-only toggle does not', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const v2 = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: 'new body' },
    });
    expect(v2.json().version).toBe(2);

    const v3 = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { name: 'renamed' },
    });
    expect(v3.json().version).toBe(3);

    const toggled = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { enabled: false },
    });
    expect(toggled.json().version).toBe(3);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    await app.close();
  });

  it('GET /skills/:id/versions/:version returns one snapshot', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;
    await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { body: 'v2 body' } });

    const v1 = await app.inject({ method: 'GET', url: `/skills/${skillId}/versions/1` });
    expect(v1.statusCode).toBe(200);
    expect(v1.json()).toMatchObject({ version: 1, body: createBody.body });
    await app.close();
  });

  it('404s for an unknown skill and an unknown version', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;
    const ghost = '00000000-0000-0000-0000-000000000000';

    expect((await app.inject({ method: 'GET', url: `/skills/${ghost}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${ghost}/versions` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${skillId}/versions/99` })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('skills are workspace-scoped: another tenant cannot read them', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills' }).returning();
    const repo = new SkillsRepository(db);
    const foreign = await repo.insert({
      workspaceId: otherWs!.id,
      name: 'Foreign skill',
      description: 'x',
      type: 'custom',
      source: 'manual',
      body: 'x',
    });

    const service = new SkillsService({ db } as unknown as Container);
    const [{ id: defaultWs }] = await db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));

    expect(await service.get(otherWs!.id, foreign.id)).toBeDefined();
    expect(await service.get(defaultWs!, foreign.id)).toBeUndefined();
    expect(await service.listVersions(defaultWs!, foreign.id)).toBeUndefined();
  });

  it('POST /skills/import/file derives the name from the first heading when omitted', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/file',
      payload: { body: '# Imported rule\nBody text.' },
    });
    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill).toMatchObject({
      name: 'Imported rule',
      source: 'extracted',
      type: 'custom',
      enabled: true,
    });
    await app.close();
  });

  it('POST /skills/import/file uses an explicit name when given', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/file',
      payload: { name: 'explicit-name', body: '# Heading\nBody.' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe('explicit-name');
    await app.close();
  });
});
