/** Minimal Response-like object for mocking fetch in tests. */
export function fakeResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

/**
 * Build a fetch impl that routes by URL substring, plus a `calls` array recording every URL.
 * Each route's `body` is returned with HTTP 200 unless `status` is given.
 */
export function routedFetch(
  routes: { match: string; status?: number; body?: unknown }[],
): { impl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(url);
    const route = routes.find((r) => url.includes(r.match));
    if (!route) throw new Error(`No mock route for ${url}`);
    return fakeResponse(route.status ?? 200, route.body ?? {});
  }) as unknown as typeof fetch;
  return { impl, calls };
}
