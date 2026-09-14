type TestSource = Readonly<{
  path: string;
  source: string;
}>;

type TestPolicyInput = Readonly<{
  playwrightRetries: number;
  testSources: readonly TestSource[];
}>;

export function checkAcceptedTestPolicy({
  playwrightRetries,
  testSources,
}: TestPolicyInput): string[] {
  const problems = testSources.flatMap(findForbiddenDeclarations);

  if (playwrightRetries !== 0) {
    problems.push(`Playwright permits retried tests: retries is ${playwrightRetries}`);
  }

  return problems;
}

function findForbiddenDeclarations({ path, source }: TestSource): string[] {
  const code = stripCommentsAndStrings(source);
  const forbiddenDeclarations = [
    {
      label: "skipped",
      pattern: /\b(?:describe|it|test)(?:\s*\.\s*describe)?\s*\.\s*skip\b/u,
    },
    {
      label: "pending",
      pattern: /\b(?:describe|it|test)(?:\s*\.\s*describe)?\s*\.\s*(?:fixme|todo)\b/u,
    },
    {
      label: "quarantined",
      pattern: /\b(?:describe|it|test)(?:\s*\.\s*describe)?\s*\.\s*quarantin(?:e|ed)\b/iu,
    },
    {
      label: "focused",
      pattern: /\b(?:describe|it|test)(?:\s*\.\s*describe)?\s*\.\s*only\b/u,
    },
    {
      label: "failed by design",
      pattern: /\b(?:describe|it|test)(?:\s*\.\s*describe)?\s*\.\s*fail\b/u,
    },
    {
      label: "retried",
      pattern:
        /\b(?:describe|test)\s*\.\s*(?:describe\s*\.\s*)?configure\s*\(\s*\{[^}]*\bretries\s*:/u,
    },
    {
      label: "conditional",
      pattern: /\.\s*(?:runIf|skipIf)\s*\(/u,
    },
    {
      label: "skipped",
      pattern: /\.\s*each\s*\([\s\S]*?\)\s*\.\s*skip\b/u,
    },
  ] as const;

  return forbiddenDeclarations
    .filter(({ pattern }) => pattern.test(code))
    .map(({ label }) => `${path} contains a ${label} test declaration`);
}

function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/\/\/.*$/gmu, "")
    .replace(/'(?:\\.|[^'\\])*'/gu, "''")
    .replace(/"(?:\\.|[^"\\])*"/gu, '""')
    .replace(/`(?:\\.|[^`\\])*`/gu, "``");
}
