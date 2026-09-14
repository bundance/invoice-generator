export type WorkspaceRecoveryProblem =
  | "inconsistent"
  | "invalid-schema"
  | "malformed"
  | "newer-version"
  | "unreadable";

export class WorkspaceRecoveryError extends Error {
  readonly problem: WorkspaceRecoveryProblem;

  constructor(problem: WorkspaceRecoveryProblem, options?: ErrorOptions) {
    super(recoveryErrorMessage(problem), options);
    this.name = "WorkspaceRecoveryError";
    this.problem = problem;
  }
}

function recoveryErrorMessage(problem: WorkspaceRecoveryProblem): string {
  switch (problem) {
    case "malformed":
      return "The local dataset is not valid JSON";
    case "newer-version":
      return "The local dataset was created by a newer application version";
    case "unreadable":
      return "The local dataset could not be read";
    case "inconsistent":
    case "invalid-schema":
      return "The local dataset does not match a supported schema version";
  }
}
