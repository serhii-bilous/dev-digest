import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, boolean, integer, vector, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

export const conventions = pgTable('conventions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
  category: text('category'),
  rule: text('rule').notNull(),
  evidencePath: text('evidence_path'),
  evidenceLineStart: integer('evidence_line_start'),
  evidenceLineEnd: integer('evidence_line_end'),
  evidenceSnippet: text('evidence_snippet'),
  confidence: doublePrecision('confidence'),
  accepted: boolean('accepted').notNull().default(false),
  createdAt: now(),
});

// One row per Conventions Extractor scan of a repo — sample-file/candidate
// counts + timestamp for the "Detected from N sample files · last scan Xh
// ago" header. Kept separate from `conventions` rows so those stay pure
// candidate data across re-scans.
export const conventionScans = pgTable(
  'convention_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    sampleFileCount: integer('sample_file_count').notNull(),
    candidateCount: integer('candidate_count').notNull(),
    // GitHub-facing PR number the scan targeted (not pull_requests.id) —
    // null means the scan read the repo's default branch.
    pullNumber: integer('pull_number'),
    scannedAt: timestamp('scanned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ repoScannedIdx: index('convention_scans_repo_scanned_idx').on(t.repoId, t.scannedAt) }),
);
