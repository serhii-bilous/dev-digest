import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { Review } from '@devdigest/shared';
import { toJsonSchema } from '../src/llm/structured.js';

/**
 * Regression coverage for the $ref-inlining fix: `zodResponseFormat` hoists
 * any Zod schema object reused in more than one place into a `definitions`
 * block and points at it via `$ref` — valid JSON Schema, and OpenAI's own API
 * resolves it fine, but OpenRouter forwards the schema unmodified to
 * whichever backend it routes to, and not every provider's structured-output
 * compiler resolves `$ref`/`definitions` (observed in production: Gemini
 * fails with "reference to undefined schema", Qwen with "grammar is not
 * valid: failed to compile grammar" — on the exact schema OpenAI/DeepSeek
 * accept). `toJsonSchema` must always return a fully self-contained schema.
 */
describe('toJsonSchema', () => {
  it('the real Review schema (whose Finding reuses TrifectaComponent in two places) has no $ref or definitions', () => {
    const { schema } = toJsonSchema(Review, 'Review');
    const serialized = JSON.stringify(schema);
    expect(serialized).not.toContain('$ref');
    expect(schema.definitions).toBeUndefined();
  });

  it('a schema reusing the same nested object schema twice is fully inlined, values intact', () => {
    const Point = z.object({ x: z.number(), y: z.number() });
    const Shape = z.object({ start: Point, end: Point }); // same Zod object instance in two fields
    const { schema } = toJsonSchema(Shape, 'Shape');

    expect(JSON.stringify(schema)).not.toContain('$ref');
    const props = schema.properties as Record<string, { properties?: Record<string, unknown> }>;
    expect(props.start?.properties).toEqual(props.end?.properties);
    expect(props.start?.properties).toHaveProperty('x');
    expect(props.start?.properties).toHaveProperty('y');
  });
});
