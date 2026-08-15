import type { FindingRecord, PrFile } from "@devdigest/shared";

export function indexFilesByPath(files: PrFile[]): Map<string, PrFile> {
  return new Map(files.map((f) => [f.path, f]));
}

export function findingsForFile(path: string, findings: FindingRecord[]): FindingRecord[] {
  return findings.filter((f) => f.file === path);
}
