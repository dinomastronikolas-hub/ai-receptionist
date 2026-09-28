/**
 * Run a Supabase call and turn a thrown exception (network failure, bad
 * configuration…) into the usual `{ data, error }` result, so callers that
 * show a spinner always get to reset it.
 */
export async function attempt<T extends { error: unknown }>(fn: () => PromiseLike<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    return { data: null, error } as unknown as T;
  }
}
