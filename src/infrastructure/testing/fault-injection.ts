import { z } from "zod";

const faultPointSchema = z.enum([
  "draft-save",
  "pdf-generation",
  "pdf-verification",
  "retained-pdf-write",
  "temporary-state-write",
  "candidate-state-validation",
  "durable-state-rename",
  "temporary-state-cleanup",
  "startup-retained-pdf-cleanup",
  "document-open",
  "document-export",
  "document-print",
  "backup-creation",
  "archive-validation",
  "restore-preparation",
  "restore-pdf-preparation",
  "restored-state-commit",
  "restored-pdf-cleanup",
]);
const faultPlanSchema = z.array(faultPointSchema).readonly();

export type FaultPoint = z.infer<typeof faultPointSchema>;

export type FaultInjector = Readonly<{
  throwIfPlanned: (point: FaultPoint) => void;
}>;

export const noFaultInjector: FaultInjector = { throwIfPlanned: () => undefined };

export function createFaultInjectorFromJson(planJson: string | undefined): FaultInjector {
  if (planJson === undefined) return noFaultInjector;

  try {
    const planInput: unknown = JSON.parse(planJson);
    return createFaultInjector(faultPlanSchema.parse(planInput));
  } catch {
    throw new Error("The test fault plan is invalid");
  }
}

export function createFaultInjector(plan: readonly FaultPoint[]): FaultInjector {
  let nextFaultIndex = 0;

  return {
    throwIfPlanned: (point) => {
      if (plan[nextFaultIndex] !== point) return;
      nextFaultIndex += 1;
      throw new Error(`Injected failure at ${point}`);
    },
  };
}
