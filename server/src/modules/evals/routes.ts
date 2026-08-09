import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { EvalCaseInput, EvalExpectedOutput, EvalOwnerKind } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { EvalsService } from './service.js';

/**
 * A1/A4 — evals module (per-agent Evals tab; `owner_kind` also supports
 * 'skill' at the data layer, unused by any route yet).
 *   GET    /evals?owner_kind=&owner_id=      → list, scoped to an owner
 *   GET    /evals/:id                        → one case
 *   POST   /evals                            → create
 *   PUT    /evals/:id                        → update
 *   DELETE /evals/:id                        → delete
 *   POST   /evals/:id/run                    → run one case → EvalRunResult
 *   POST   /evals/run-all?owner_kind=&owner_id=  → run every case for an owner
 *   GET    /evals/summary?owner_kind=&owner_id=  → {total, passing} header badge
 */

const OwnerQuery = z.object({ owner_kind: EvalOwnerKind, owner_id: z.string().uuid() });

const CreateEvalCaseBody = EvalCaseInput.omit({ expected_output: true }).extend({
  expected_output: EvalExpectedOutput,
});

const UpdateEvalCaseBody = CreateEvalCaseBody.partial();

export default async function evalsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalsService(app.container);

  app.get('/evals', { schema: { querystring: OwnerQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.query.owner_kind, req.query.owner_id);
  });

  app.get('/evals/summary', { schema: { querystring: OwnerQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.summary(workspaceId, req.query.owner_kind, req.query.owner_id);
  });

  app.get('/evals/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const evalCase = await service.get(workspaceId, req.params.id);
    if (!evalCase) throw new NotFoundError('Eval case not found');
    return evalCase;
  });

  app.post('/evals', { schema: { body: CreateEvalCaseBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const evalCase = await service.create(workspaceId, req.body);
    reply.status(201);
    return evalCase;
  });

  app.put(
    '/evals/:id',
    { schema: { params: IdParams, body: UpdateEvalCaseBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const evalCase = await service.update(workspaceId, req.params.id, req.body);
      if (!evalCase) throw new NotFoundError('Eval case not found');
      return evalCase;
    },
  );

  app.delete('/evals/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Eval case not found');
    return { ok: true };
  });

  app.post('/evals/:id/run', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.runOne(workspaceId, req.params.id);
  });

  app.post('/evals/run-all', { schema: { querystring: OwnerQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.runAll(workspaceId, req.query.owner_kind, req.query.owner_id);
  });
}
