const fileTaskLimit = 4;

export async function runFileTasks<Item>(
  items: readonly Item[],
  task: (item: Item) => Promise<void>,
): Promise<void> {
  const remainingItems = items[Symbol.iterator]();
  let firstError: Error | null = null;

  async function runNext(): Promise<void> {
    const nextItem = remainingItems.next();
    if (nextItem.done) return;
    try {
      await task(nextItem.value);
    } catch (error) {
      firstError ??= error instanceof Error ? error : new Error("A file task failed");
    }
    await runNext();
  }

  await Promise.all(Array.from({ length: Math.min(fileTaskLimit, items.length) }, () => runNext()));
  if (firstError) throw firstError;
}
