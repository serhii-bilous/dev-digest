import type {
  EvalCase,
  EvalCaseInput,
  EvalCaseWithLatestRun,
  EvalOwnerKind,
  EvalRunResult,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { EvalsRepository } from './repository.js';
import { toEvalCaseDto, toEvalRunDto } from './helpers.js';
import { runEvalCase, runSkillEvalCase, type EvalRunOutcome } from './runner.js';

/**
 * A1/A4 — evals service. `eval_cases.owner_kind` supports both 'agent' and
 * 'skill': an agent-owned case runs through that agent's real
 * provider/model/system prompt/enabled skills; a skill-owned case runs
 * through an isolated test harness (fixed generic reviewer, only that
 * skill's body injected) since a skill alone has no engine of its own.
 */
export class EvalsService {
  private repo: EvalsRepository;

  constructor(private container: Container) {
    this.repo = new EvalsRepository(container.db);
  }

  /** List an owner's eval cases, each with its most-recent run attached —
   *  what the Evals tab list needs for its status icon + "expected N, got M". */
  async list(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<EvalCaseWithLatestRun[]> {
    const rows = await this.repo.list(workspaceId, ownerKind, ownerId);
    const latest = await this.repo.latestRunPerCase(rows.map((r) => r.id));
    return rows.map((row) => {
      const runRow = latest.get(row.id);
      return { ...toEvalCaseDto(row), latest_run: runRow ? toEvalRunDto(runRow) : null };
    });
  }

  async get(workspaceId: string, id: string): Promise<EvalCase | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toEvalCaseDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: EvalCaseInput): Promise<EvalCase> {
    const row = await this.repo.insert({
      workspaceId,
      ownerKind: input.owner_kind,
      ownerId: input.owner_id,
      name: input.name,
      inputDiff: input.input_diff,
      inputFiles: input.input_files,
      inputMeta: input.input_meta,
      expectedOutput: input.expected_output,
      notes: input.notes,
    });
    return toEvalCaseDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: Partial<EvalCaseInput>,
  ): Promise<EvalCase | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.input_diff !== undefined ? { inputDiff: patch.input_diff } : {}),
      ...(patch.input_files !== undefined ? { inputFiles: patch.input_files } : {}),
      ...(patch.input_meta !== undefined ? { inputMeta: patch.input_meta } : {}),
      ...(patch.expected_output !== undefined ? { expectedOutput: patch.expected_output } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    });
    return row ? toEvalCaseDto(row) : undefined;
  }

  /**
   * Run one eval case for real: resolve the owner (agent or skill), execute
   * the review through the appropriate engine path, grade the grounded
   * findings, persist the eval_runs row.
   */
  async runOne(workspaceId: string, caseId: string): Promise<EvalRunResult> {
    const evalCase = await this.repo.getById(workspaceId, caseId);
    if (!evalCase) throw new NotFoundError('Eval case not found');

    let outcome: EvalRunOutcome;
    if (evalCase.ownerKind === 'agent') {
      const agent = await this.container.agentsRepo.getById(workspaceId, evalCase.ownerId);
      if (!agent) throw new NotFoundError('Owning agent not found');
      outcome = await runEvalCase(this.container, agent, evalCase);
    } else {
      const skill = await this.container.skillsRepo.getById(workspaceId, evalCase.ownerId);
      if (!skill) throw new NotFoundError('Owning skill not found');
      outcome = await runSkillEvalCase(this.container, skill, evalCase);
    }
    const { actualOutput, metrics } = outcome;
    const runRow = await this.repo.insertRun({
      caseId: evalCase.id,
      actualOutput,
      pass: metrics.pass,
      recall: metrics.recall,
      precision: metrics.precision,
      citationAccuracy: metrics.citation_accuracy,
      durationMs: metrics.duration_ms,
      costUsd: metrics.cost_usd,
    });

    return {
      run_id: runRow.id,
      case_id: evalCase.id,
      result: {
        recall: metrics.recall,
        precision: metrics.precision,
        citation_accuracy: metrics.citation_accuracy,
        traces_passed: metrics.pass ? 1 : 0,
        traces_total: 1,
        duration_ms: metrics.duration_ms,
        cost_usd: metrics.cost_usd,
        per_trace: [
          {
            name: evalCase.name,
            pass: metrics.pass,
            expected: evalCase.expectedOutput,
            actual: actualOutput,
          },
        ],
      },
    };
  }

  /** Run every case for an owner, sequentially (mirrors run-executor.ts's
   *  per-agent sequential style — avoids bursting the LLM provider). */
  async runAll(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<EvalRunResult[]> {
    const cases = await this.repo.list(workspaceId, ownerKind, ownerId);
    const results: EvalRunResult[] = [];
    for (const c of cases) {
      results.push(await this.runOne(workspaceId, c.id));
    }
    return results;
  }

  /** "N of M passing" header badge: most-recent run per case; never-run
   *  cases count as not-passing. */
  async summary(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<{ total: number; passing: number }> {
    const cases = await this.repo.list(workspaceId, ownerKind, ownerId);
    const latest = await this.repo.latestRunPerCase(cases.map((c) => c.id));
    const passing = cases.filter((c) => latest.get(c.id)?.pass === true).length;
    return { total: cases.length, passing };
  }
}
