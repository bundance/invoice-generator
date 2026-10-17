export function requiresArchitectureInspection(path: string, mode: number): boolean {
  return (mode & 0o111) !== 0 || path.endsWith(".node");
}
