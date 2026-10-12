import fs from "node:fs";
import path from "node:path";

export type TaskBudget = {
  attempts: number;
  reasons: string[];
};

export type BudgetState = {
  tasks: Record<string, TaskBudget>;
};

export function statePath(home: string): string {
  return path.join(home, "state.json");
}

export function loadBudget(home: string): BudgetState {
  const file = statePath(home);
  if (!fs.existsSync(file)) return { tasks: {} };
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error("state-filen är oläsbar. Konsultationen stoppas så att räknaren inte nollställs.");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("state-filen har fel form.");
  }
  const tasks = (raw as { tasks?: unknown }).tasks;
  if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) {
    throw new Error("state-filen saknar tasks.");
  }
  return { tasks: tasks as Record<string, TaskBudget> };
}

export function saveBudget(home: string, state: BudgetState): void {
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  fs.writeFileSync(statePath(home), `${JSON.stringify(state)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function taskBudget(state: BudgetState, taskId: string): TaskBudget {
  return state.tasks[taskId] ?? { attempts: 0, reasons: [] };
}

export function recordAttempt(
  state: BudgetState,
  taskId: string,
  reason: string,
): BudgetState {
  const current = taskBudget(state, taskId);
  return {
    tasks: {
      ...state.tasks,
      [taskId]: {
        attempts: current.attempts + 1,
        reasons: [...current.reasons, reason],
      },
    },
  };
}
