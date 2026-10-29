import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../client.js';
import { ApiCallError } from '../client.js';
import { resolveRepo, ToolInputError } from '../resolve.js';
import type { AgentSummary } from '../types.js';

const inputSchema = {
  repo: z
    .string()
    .optional()
    .describe(
      "Optional repo id (uuid) or 'owner/name'. When set, only agents compatible with the repo's " +
        'languages are returned, each with an `active` flag.',
    ),
};

/** Defensive cap — a workspace realistically has a handful of agents. */
const MAX_AGENTS = 100;

export function registerListAgentsTool(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'list_agents',
    {
      description:
        "Lists DevDigest's configured reviewer agents. The returned `id` is what " +
        "run_agent_on_pr's `agent` argument expects. Pass `repo` to list only agents compatible " +
        'with that repo (with an `active` flag).',
      inputSchema,
    },
    async ({ repo }: { repo?: string }) => {
      try {
        let agents: AgentSummary[];
        if (repo) {
          const r = await resolveRepo(client, repo);
          agents = await client.get<AgentSummary[]>(`/agents?repo=${encodeURIComponent(r.id)}`);
        } else {
          agents = await client.get<AgentSummary[]>('/agents');
        }
        const trimmed = agents.slice(0, MAX_AGENTS).map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          provider: a.provider,
          model: a.model,
          languages: a.languages,
          ...(repo ? { active: a.active } : {}),
        }));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(trimmed) }],
          structuredContent: { agents: trimmed },
        };
      } catch (err) {
        if (err instanceof ToolInputError) {
          return { content: [{ type: 'text' as const, text: err.message }], isError: true };
        }
        const message =
          err instanceof ApiCallError
            ? `DevDigest API error (${err.code}): ${err.message}`
            : 'DevDigest API unreachable — is ./scripts/dev.sh running?';
        return { content: [{ type: 'text' as const, text: message }], isError: true };
      }
    },
  );
}
