# Examples

## Good — the Row -> DTO mapping boundary (`modules/agents/`, as-is)

```ts
// repository.ts — Infrastructure: returns the raw Drizzle row shape
export class AgentsRepository {
  async findById(id: string): Promise<AgentRow | undefined> { /* drizzle-orm query */ }
}

// helpers.ts — the ONLY place that sees both AgentRow and Agent
export function toAgentDto(row: AgentRow): Agent {
  return { id: row.id, name: row.name, provider: row.provider, /* ... */ };
}

// service.ts — Application: maps immediately, never holds a raw row
export async function getAgent(container: Container, id: string): Promise<Agent> {
  const row = await container.agentsRepo.findById(id);
  if (!row) throw new NotFoundError('agent');
  return toAgentDto(row); // <- boundary crossed here, not in routes.ts
}
```

`routes.ts` only ever sees `Agent`, never `AgentRow`. If the `agents` table gains an internal-only column tomorrow, `service.ts`/`routes.ts` are unaffected unless `toAgentDto` is updated on purpose.

## Bad — a Drizzle row leaking past the Application layer

```ts
// modules/reports/service.ts — BAD: no mapping, DB row returned as-is
import type { ReportRow } from './repository.js';

export async function getReport(container: Container, id: string): Promise<ReportRow> {
  return container.reportsRepo.findById(id); // routes.ts now serializes raw DB columns
}
```

**Fix:** add `toReportDto(row: ReportRow): Report` to `helpers.ts` and change the return type to `Report`. Now a column rename in `db/schema/reports.ts` fails to compile at the mapper instead of silently changing the public API response shape.

## Bad — constructing an adapter outside the composition root

```ts
// modules/x/service.ts — BAD: bypasses container.ts, can't be mocked in tests
import { OpenAIProvider } from '../../adapters/llm/openai.js';

const llm = new OpenAIProvider(process.env.OPENAI_API_KEY!);
```

**Fix:**

```ts
// service.ts takes the Container and asks for the port
const llm = await container.llm('openai'); // returns LLMProvider; container decides the concrete class
```

Now `container.llm()` handles the missing-key `ConfigError`, caches the client, and can be swapped for a mock via `ContainerOverrides.llm` in tests — none of which the inline `new OpenAIProvider(...)` gets for free.

## Good — ports and adapters (existing pattern, copy for new integrations)

```ts
// vendor/shared/adapters.ts — the port
export interface LLMProvider {
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

// adapters/llm/anthropic.ts — one adapter implementing the port
export class AnthropicProvider implements LLMProvider { /* ... */ }

// platform/container.ts — composition root decides which adapter, by id
async llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
  if (this.overrides.llm?.[id]) return this.overrides.llm[id]!; // test override wins
  // ...construct + cache the real adapter...
}
```

`service.ts` code that needs an LLM call only ever types against `LLMProvider` — it does not know or care whether `container.llm('anthropic')` resolves to `AnthropicProvider` or a test mock from `adapters/mocks.ts`.
