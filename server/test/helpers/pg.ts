import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createDb, type DbHandle } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

/**
 * Testcontainers helper: spin a Postgres + pgvector container, run migrations,
 * return a Drizzle client. Uses the same `pgvector/pgvector:pg16` image as
 * docker-compose so the `vector` extension is available.
 *
 * Integration tests gate on `dockerAvailable()` and skip cleanly when Docker is
 * not reachable (CI/sandbox without a Docker daemon).
 */
export interface PgFixture {
  container: StartedPostgreSqlContainer;
  handle: DbHandle;
  url: string;
  stop: () => Promise<void>;
}

let dockerCache: boolean | undefined;

/** Cheap check: can we reach a Docker daemon? */
export async function dockerAvailable(): Promise<boolean> {
  if (dockerCache !== undefined) return dockerCache;
  try {
    const { execSync } = await import('node:child_process');
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    dockerCache = true;
  } catch {
    dockerCache = false;
  }
  return dockerCache;
}

export async function startPg(): Promise<PgFixture> {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('devdigest')
    .withUsername('devdigest')
    .withPassword('devdigest')
    .start();
  const url = container.getConnectionUri();
  await runMigrations(url);
  const handle = createDb(url, { max: 5 });
  return {
    container,
    handle,
    url,
    stop: async () => {
      await handle.close();
      await container.stop();
    },
  };
}

const MIGRATIONS_SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src/db/migrations');

/**
 * Like `startPg()`, but migrates only up to and including the migration whose
 * journal tag starts with `tag` (e.g. `'0017'`). The caller inserts fixtures,
 * then calls `runMigrations(url)` to apply the rest. Returns a raw `postgres`
 * client (not Drizzle) since the table shapes at that point differ from the schema.
 */
export async function startPgUpTo(tag: string): Promise<{
  container: StartedPostgreSqlContainer;
  url: string;
  sql: postgres.Sql;
  stop: () => Promise<void>;
}> {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('devdigest')
    .withUsername('devdigest')
    .withPassword('devdigest')
    .start();
  const url = container.getConnectionUri();
  const dir = mkdtempSync(join(tmpdir(), 'dd-migrations-'));
  try {
    cpSync(MIGRATIONS_SRC, dir, { recursive: true });
    const jp = join(dir, 'meta/_journal.json');
    const journal = JSON.parse(readFileSync(jp, 'utf8')) as { entries: { tag: string }[] };
    const cut = journal.entries.findIndex((e) => e.tag.startsWith(tag));
    if (cut < 0) throw new Error(`migration tag ${tag} not in journal`);
    journal.entries = journal.entries.slice(0, cut + 1);
    writeFileSync(jp, JSON.stringify(journal));
    const mig = postgres(url, { max: 1 });
    try {
      await mig`CREATE EXTENSION IF NOT EXISTS vector`;
      await migrate(drizzle(mig), { migrationsFolder: dir });
    } finally {
      await mig.end({ timeout: 5 });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const sql = postgres(url, { max: 2 });
  return {
    container,
    url,
    sql,
    stop: async () => {
      await sql.end({ timeout: 5 });
      await container.stop();
    },
  };
}
