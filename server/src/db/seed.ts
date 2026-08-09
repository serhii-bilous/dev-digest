import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, six demo skills, and the four built-in agents (General +
 * Security + Performance + Test Quality), all on the default
 * openrouter/deepseek-v4-flash provider+model. Test Quality Reviewer ships with
 * two skills pre-linked.
 *
 * Course lessons populate the other tables (conventions, memory, eval, …) once
 * their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
      {
        reviewId: review!.id,
        file: 'src/middleware/ratelimit.ts',
        startLine: 30,
        endLine: 30,
        severity: 'SUGGESTION',
        category: 'style',
        title: 'Magic number for bucket size',
        rationale: 'The token bucket capacity `100` is inlined at the call site.',
        suggestion: 'Extract to a named `DEFAULT_BUCKET_SIZE` constant.',
        confidence: 0.72,
      },
    ]);
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- demo skills (L02) ----
  // `test-coverage-nudge` is seeded with source: 'extracted' so it reads as
  // having come through the file-import path, without actually calling the
  // import endpoint (seed data, not an HTTP round-trip).
  const seedSkills: Array<typeof t.skills.$inferInsert> = [
    {
      workspaceId,
      name: 'pr-quality-rubric',
      description: 'General PR quality checklist applied on top of the agent’s own review.',
      type: 'rubric',
      source: 'manual',
      body: '# PR quality rubric\nWhen reviewing this diff, also check:\n- Every new branch (if/else, catch, early return) has a corresponding test.\n- Public function/route signatures are not changed without updating every caller.\n- No commented-out code or leftover debug logging in the diff.',
      enabled: true,
    },
    {
      workspaceId,
      name: 'no-then-chains',
      description: 'Flags Promise .then() chains in new code; this codebase standardizes on async/await.',
      type: 'convention',
      source: 'manual',
      body: '# Convention: no .then() chains\nThis codebase uses async/await exclusively for promise handling. Flag any new `.then(...)`/`.catch(...)` chain in the diff and suggest the async/await equivalent.',
      enabled: true,
    },
    {
      workspaceId,
      name: 'secret-leakage-gate',
      description: 'Flags hardcoded secrets, API keys, and tokens committed in plaintext.',
      type: 'security',
      source: 'manual',
      body: '# Secret leakage gate\nScan the diff for hardcoded secrets: API keys (`sk_live_`, `sk_test_`, `ghp_`, ...), private keys, passwords, or tokens committed in plaintext (code, config, fixtures, or test files). Flag every match as CRITICAL regardless of whether the surrounding code claims it is a placeholder or test value.',
      enabled: true,
    },
    {
      workspaceId,
      name: 'lethal-trifecta',
      description: 'Flags the lethal-trifecta pattern: untrusted content + private data access + an exfiltration path in one agent flow.',
      type: 'security',
      source: 'manual',
      body: '# Lethal trifecta\nFlag any single flow where (1) untrusted content (PR body, web page, file, tool output) reaches an LLM/agent that also has (2) access to private data, with (3) a way to exfiltrate it (outbound call, tool, attacker-readable output). Require a concrete file:line for all three components before flagging — an authenticated API returning data to its own logged-in user is NOT this pattern.',
      enabled: true,
    },
    {
      workspaceId,
      name: 'phantom-api-gate',
      description: 'Flags calls to endpoints, routes, or methods that do not exist anywhere in the codebase.',
      type: 'security',
      source: 'manual',
      body: '# Phantom API gate\nFlag any call to a route, RPC method, or external API endpoint referenced in the diff that has no matching definition anywhere in the codebase (a hallucinated or renamed-but-not-updated endpoint). This is a correctness/availability issue, not a style nit — report it even if the rest of the diff looks fine.',
      enabled: true,
    },
    {
      workspaceId,
      name: 'test-coverage-nudge',
      description: 'Flags new branches, error paths, and edge cases introduced without a corresponding test.',
      type: 'custom',
      source: 'extracted',
      body: '# Test coverage nudge\nFor every new branch, error path, or edge case introduced in the production diff, confirm the test diff exercises it. If a new `if`/`catch`/early-return has no test that takes the untaken path, flag it — name the specific branch, not a generic "add more tests" note.',
      enabled: true,
    },
  ];
  const skillIdByName = new Map<string, string>();
  for (const sk of seedSkills) {
    const [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, sk.name)));
    if (existing) {
      skillIdByName.set(sk.name, existing.id);
    } else {
      const [inserted] = await db.insert(t.skills).values(sk).returning();
      await db.insert(t.skillVersions).values({
        skillId: inserted!.id,
        version: inserted!.version,
        body: inserted!.body,
      });
      skillIdByName.set(sk.name, inserted!.id);
    }
  }

  // ---- Test Quality Reviewer (L02) — 4th built-in agent, ships with 2 linked skills ----
  const [existingTestAgent] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Test Quality Reviewer')));
  let testAgentId = existingTestAgent?.id;
  if (!existingTestAgent) {
    const [inserted] = await db
      .insert(t.agents)
      .values({
        workspaceId,
        name: 'Test Quality Reviewer',
        description: 'Flags uncovered branches, missed edge cases, excessive mocking, and flaky-test patterns.',
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
        enabled: true,
        version: 1,
        createdBy: userId,
      })
      .returning();
    testAgentId = inserted!.id;
  }
  if (testAgentId) {
    const testCoverageId = skillIdByName.get('test-coverage-nudge');
    const rubricId = skillIdByName.get('pr-quality-rubric');
    const links = [
      testCoverageId ? { agentId: testAgentId, skillId: testCoverageId, order: 0 } : null,
      rubricId ? { agentId: testAgentId, skillId: rubricId, order: 1 } : null,
    ].filter((l): l is { agentId: string; skillId: string; order: number } => l !== null);
    for (const link of links) {
      await db.insert(t.agentSkills).values(link).onConflictDoNothing();
    }
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
