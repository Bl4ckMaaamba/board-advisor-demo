const DEFAULT_TIMEOUT_MS = 15000;

export async function withTimeout<T>(
  promise: Promise<T>,
  toolName: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timeout: l'outil ${toolName} n'a pas répondu en ${timeoutMs / 1000}s`)),
      timeoutMs
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
