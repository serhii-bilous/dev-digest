import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module — extract house code-style conventions from a repo and
 * turn accepted candidates into a Skill (via the existing `POST /skills`,
 * widened to accept `source`/`evidence_files` — see skills/routes.ts).
 *
 *   GET  /repos/:id/conventions          → candidates + latest scan metadata
 *   POST /repos/:id/conventions/extract  → run a scan (also used for "Re-scan")
 *   PUT  /conventions/:id                → accept/reject/edit one candidate
 */

const UpdateConventionBody = z.object({
  accepted: z.boolean().optional(),
  rule: z.string().min(1).optional(),
});

/** Omitted/undefined `pull_number` scans the repo's default branch. */
const ExtractConventionsBody = z.object({
  pull_number: z.number().int().positive().optional(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      // Not validated via `schema.body` — a bodyless POST (no PR selected,
      // matching every pre-existing caller) must stay valid, and zod's
      // `z.object` rejects `undefined` outright rather than treating it as
      // "no fields given".
      const parsed = ExtractConventionsBody.safeParse(req.body ?? {});
      if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.issues);
      return service.extract(workspaceId, req.params.id, parsed.data.pull_number);
    },
  );

  app.put(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidate = await service.update(workspaceId, req.params.id, req.body);
      if (!candidate) throw new NotFoundError('Convention not found');
      return candidate;
    },
  );
}
