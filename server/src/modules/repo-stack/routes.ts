import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { RepoStack } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * repo-stack module — transport only.
 *   GET  /repos/:id/stack          → RepoStack (fetches when never attempted / unknown past cooldown)
 *   POST /repos/:id/stack/refresh  → RepoStack (Retry: bypasses the cooldown)
 */
export default async function repoStackRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.repoStack;

  app.get('/repos/:id/stack', { schema: { params: IdParams, response: { 200: RepoStack } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getStack(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/stack/refresh',
    { schema: { params: IdParams, response: { 200: RepoStack } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.ensure(workspaceId, req.params.id, { force: true });
    },
  );
}
