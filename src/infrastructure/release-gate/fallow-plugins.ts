const requiredFallowPlugins = ["electron", "vite"] as const;

export function findMissingRequiredFallowPlugins(loadedPlugins: readonly string[]): string[] {
  return requiredFallowPlugins.filter((plugin) => !loadedPlugins.includes(plugin));
}
