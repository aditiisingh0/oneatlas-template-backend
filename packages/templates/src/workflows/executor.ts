// packages/templates/src/workflows/executor.ts
// ─── Workflow Executor — runs WorkflowDef step chains with state persistence ───

import type { WorkflowDef, WorkflowStep, WorkflowTrigger } from '../types/app-spec.js';

export type WorkflowRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retrying';

export interface WorkflowRun {
  runId: string;
  workflowId: string;
  appId: string;
  tenantId: string;
  triggerPayload: unknown;
  status: WorkflowRunStatus;
  currentStep: number;
  stepResults: StepResult[];
  context: Record<string, unknown>;  // accumulated output vars
  startedAt: string;
  completedAt?: string;
  error?: string;
  retryCount: number;
}

export interface StepResult {
  stepIndex: number;
  type: string;
  status: 'success' | 'failed' | 'skipped';
  outputVar?: string;
  output?: unknown;
  error?: string;
  durationMs: number;
  executedAt: string;
}

// ─── Step executors ───────────────────────────────────────────────────────────
type StepExecutor = (
  step: WorkflowStep,
  context: Record<string, unknown>,
  run: WorkflowRun
) => Promise<{ output: unknown; outputVar?: string }>;

const STEP_EXECUTORS: Partial<Record<WorkflowStep['type'], StepExecutor>> = {
  async ai(step, context) {
    if (step.type !== 'ai') throw new Error('Wrong step type');

    // Interpolate context variables in prompt
    const prompt = interpolate(step.prompt, context);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env['ANTHROPIC_API_KEY'] ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: step.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`AI step failed: ${response.statusText}`);
    const data = await response.json() as { content: { type: string; text: string }[] };
    const text = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');

    return { output: text, outputVar: step.outputVar };
  },

  async http(step, context) {
    if (step.type !== 'http') throw new Error('Wrong step type');

    const url = interpolate(step.url, context);
    const body = step.body ? JSON.stringify(interpolateObject(step.body, context)) : undefined;

    const fetchInit: RequestInit = {
      method: step.method,
      headers: { 'Content-Type': 'application/json', ...step.headers },
    };
    if (body !== undefined) fetchInit.body = body;
    const response = await fetch(url, fetchInit);

    const responseData = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`HTTP step failed: ${response.status}`);

    return { output: responseData, outputVar: step.outputVar };
  },

  async notify(step, _context) {
    if (step.type !== 'notify') throw new Error('Wrong step type');
    // Stub — wire to SendGrid/Slack/etc based on channel
    console.log(`[Workflow] Notify via ${step.channel} to ${step.recipients.join(', ')}`);
    return { output: { sent: true } };
  },

  async condition(step, context) {
    if (step.type !== 'condition') throw new Error('Wrong step type');
    const result = evaluateCondition(step.expression, context);
    // Return branch to execute
    return { output: { branch: result ? 'true' : 'false', steps: result ? step.trueBranch : step.falseBranch } };
  },
};

// ─── Main WorkflowExecutor ────────────────────────────────────────────────────
export class WorkflowExecutor {
  private runs = new Map<string, WorkflowRun>();

  async startRun(
    workflow: WorkflowDef,
    appId: string,
    tenantId: string,
    triggerPayload: unknown
  ): Promise<WorkflowRun> {
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const run: WorkflowRun = {
      runId,
      workflowId: workflow.id,
      appId,
      tenantId,
      triggerPayload,
      status: 'pending',
      currentStep: 0,
      stepResults: [],
      context: { trigger: triggerPayload },
      startedAt: new Date().toISOString(),
      retryCount: 0,
    };

    this.runs.set(runId, run);
    // Execute async
    this.executeRun(run, workflow).catch(console.error);
    return run;
  }

  private async executeRun(run: WorkflowRun, workflow: WorkflowDef): Promise<void> {
    run.status = 'running';
    this.runs.set(run.runId, { ...run });

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i]!;
      run.currentStep = i;

      const startTime = Date.now();
      try {
        const executor = STEP_EXECUTORS[step.type];
        if (!executor) throw new Error(`No executor for step type: ${step.type}`);

        const { output, outputVar } = await executor(step, run.context, run);

        if (outputVar) {
          run.context[outputVar] = output;
        }

        const successResult: StepResult = {
          stepIndex: i,
          type: step.type,
          status: 'success',
          durationMs: Date.now() - startTime,
          executedAt: new Date().toISOString(),
        };
        if (outputVar !== undefined) successResult.outputVar = outputVar;
        if (output !== undefined) successResult.output = output;
        run.stepResults.push(successResult);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const failedResult: StepResult = {
          stepIndex: i,
          type: step.type,
          status: 'failed',
          error: errorMsg,
          durationMs: Date.now() - startTime,
          executedAt: new Date().toISOString(),
        };
        run.stepResults.push(failedResult);

        if (workflow.onError === 'stop' || !workflow.onError) {
          run.status = 'failed';
          run.error = errorMsg;
          run.completedAt = new Date().toISOString();
          this.runs.set(run.runId, { ...run });
          return;
        }
        // onError === 'continue' — keep going
      }

      this.runs.set(run.runId, { ...run });
    }

    run.status = 'completed';
    run.completedAt = new Date().toISOString();
    this.runs.set(run.runId, { ...run });
  }

  getRun(runId: string): WorkflowRun | null {
    return this.runs.get(runId) ?? null;
  }

  listRuns(workflowId: string): WorkflowRun[] {
    return [...this.runs.values()].filter((r) => r.workflowId === workflowId);
  }
}

// ─── Condition evaluator (JSON logic subset) ──────────────────────────────────
export function evaluateCondition(expression: string, context: Record<string, unknown>): boolean {
  try {
    // Safe eval: replace context variables in expression string
    const interpolated = interpolate(expression, context);
    // Only allow safe boolean expressions
    const safe = interpolated.replace(/[^a-zA-Z0-9\s.><=!&|()'"]+/g, '');
    return Boolean(Function(`"use strict"; return (${safe})`)());
  } catch {
    return false;
  }
}

// ─── Template string interpolation ───────────────────────────────────────────
function interpolate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const val = getNestedValue(context, key.trim());
    return val !== undefined ? String(val) : _match;
  });
}

function interpolateObject(obj: unknown, context: Record<string, unknown>): unknown {
  if (typeof obj === 'string') return interpolate(obj, context);
  if (Array.isArray(obj)) return obj.map((item) => interpolateObject(item, context));
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, interpolateObject(v, context)])
    );
  }
  return obj;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

// ─── Workflow trigger matcher ─────────────────────────────────────────────────
export function matchesTrigger(
  trigger: WorkflowTrigger,
  requestMethod: string,
  requestPath: string
): boolean {
  if (trigger.type === 'webhook') {
    return trigger.method === requestMethod && trigger.path === requestPath;
  }
  return false;
}

// ─── Singleton ────────────────────────────────────────────────────────────────
export const workflowExecutor = new WorkflowExecutor();