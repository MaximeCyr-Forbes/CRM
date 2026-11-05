export function scheduleDebouncedTask(task: () => void, delayMs: number): () => void {
  const timer = setTimeout(task, delayMs);
  return () => clearTimeout(timer);
}
