import type { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

/**
 * structured-output helpers shared by all LLM providers.
 *
 * - `toJsonSchema` converts a Zod schema to a JSON Schema (draft-07, strict
 *   object) by reusing OpenAI's bundled converter — used for OpenAI's
 *   `response_format: json_schema`, Anthropic forced tool-use `input_schema`,
 *   AND OpenRouter's pass-through `response_format` (which forwards the
 *   schema unmodified to whichever backend it routes to).
 * - `parseWithRepair` validates raw model text against the Zod schema and, on
 *   failure, returns a reprompt instruction so the caller can retry-on-error.
 */

export interface JsonSchema {
  schema: Record<string, unknown>;
  name: string;
}

/**
 * Inline every `$ref` against the schema's own `definitions` block and drop
 * `definitions` from the result, so the returned schema is fully self-
 * contained. `zodResponseFormat` hoists any Zod schema object reused in more
 * than one place (e.g. an enum referenced from two different fields) into
 * `definitions` and points at it via `$ref` — valid JSON Schema, and OpenAI's
 * own API resolves it fine, but OpenRouter forwards the schema verbatim to
 * whichever backend it routes a request to, and not every provider's
 * structured-output/grammar compiler resolves `$ref`/`definitions` (seen in
 * production: Gemini fails with "reference to undefined schema", Qwen with
 * "grammar is not valid: failed to compile grammar" — both on the exact same
 * schema OpenAI and DeepSeek accept without complaint). Inlining removes the
 * indirection entirely so the schema works the same everywhere.
 *
 * `seen` guards against a cycle (a self-referential/recursive Zod schema,
 * which none of ours are today) — a ref already on the current resolution
 * path is left as `$ref` rather than expanded infinitely.
 */
function inlineRefs(schema: Record<string, unknown>): Record<string, unknown> {
  const definitions = (schema.definitions ?? {}) as Record<string, unknown>;

  function resolve(node: unknown, seen: ReadonlySet<string>): unknown {
    if (Array.isArray(node)) return node.map((n) => resolve(n, seen));
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      const ref = obj.$ref;
      if (typeof ref === 'string' && ref.startsWith('#/definitions/')) {
        const name = ref.slice('#/definitions/'.length);
        if (seen.has(name) || !(name in definitions)) return obj; // cyclic or dangling — leave as-is
        return resolve(definitions[name], new Set([...seen, name]));
      }
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'definitions') continue; // strip nested definitions blocks too
        out[key] = resolve(value, seen);
      }
      return out;
    }
    return node;
  }

  const { definitions: _drop, ...rest } = schema;
  return resolve(rest, new Set()) as Record<string, unknown>;
}

export function toJsonSchema<T>(schema: z.ZodType<T>, name: string): JsonSchema {
  const rf = zodResponseFormat(schema as z.ZodTypeAny, name);
  return { schema: inlineRefs(rf.json_schema.schema as Record<string, unknown>), name };
}

/** Best-effort extraction of a JSON object/array from a model's text output. */
export function extractJson(text: string): string {
  const trimmed = text.trim();
  // strip ```json fences
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  // find first balanced { … } or [ … ]
  const firstObj = trimmed.indexOf('{');
  const firstArr = trimmed.indexOf('[');
  const start =
    firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start === -1) return trimmed;
  const open = trimmed[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }
  return trimmed.slice(start);
}

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; repromptMessage: string };

export function parseWithRepair<T>(schema: z.ZodType<T>, raw: string): ParseResult<T> {
  let parsedJson: unknown;
  try {
    // Strict json_schema mode returns pure JSON — parse it directly. Only fall
    // back to fence/brace extraction if that fails, because extractJson can be
    // fooled by ``` fences or `{` braces that appear INSIDE JSON string values
    // (e.g. markdown code blocks in an onboarding `body`).
    try {
      parsedJson = JSON.parse(raw.trim());
    } catch {
      parsedJson = JSON.parse(extractJson(raw));
    }
  } catch (e) {
    const msg = `Output was not valid JSON: ${(e as Error).message}`;
    return {
      ok: false,
      error: msg,
      repromptMessage: `${msg}\nReturn ONLY a single valid JSON object matching the schema, no prose.`,
    };
  }
  const result = schema.safeParse(parsedJson);
  if (result.success) return { ok: true, data: result.data };
  const issues = result.error.issues
    .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  return {
    ok: false,
    error: issues,
    repromptMessage: `Your JSON did not match the required schema. Fix these and return ONLY valid JSON:\n${issues}`,
  };
}
