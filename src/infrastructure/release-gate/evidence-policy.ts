type ElectronJourneyStatus = "failed" | "interrupted" | "passed" | "skipped" | "timedOut";

type EvidencePolicyInput = Readonly<{
  attemptedNetworkRequests: readonly string[];
  testStatus: ElectronJourneyStatus;
}>;

type EvidenceDecision =
  | Readonly<{ kind: "remove" }>
  | Readonly<{ kind: "retain"; problems: readonly string[] }>;

export function decideEvidenceRetention({
  attemptedNetworkRequests,
  testStatus,
}: EvidencePolicyInput): EvidenceDecision {
  const problems = attemptedNetworkRequests.map(
    (url) => `Electron journey attempted a network request: ${url}`,
  );

  if (testStatus !== "passed") {
    problems.unshift(`Electron journey ended with status ${testStatus}`);
  }

  return problems.length === 0 ? { kind: "remove" } : { kind: "retain", problems };
}
