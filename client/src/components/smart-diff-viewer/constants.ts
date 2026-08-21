import type { SmartDiffRole } from "@devdigest/shared";

/** Fixed render order — core first (review closely), boilerplate last
 *  (skim only). Never re-sort by the API response's own group order. */
export const ROLE_ORDER: SmartDiffRole[] = ["core", "wiring", "boilerplate"];
