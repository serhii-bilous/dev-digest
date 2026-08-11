/**
 * Live "derived name" preview for the import form — duplicates the server's
 * `deriveNameFromMarkdown` (server/src/modules/skills/helpers.ts) so the name
 * field's placeholder matches what the server will actually store when left
 * blank. No shared util layer between client/server packages here.
 */
export function deriveNameFromMarkdown(body: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || "";
}
