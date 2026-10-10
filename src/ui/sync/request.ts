/**
 * One call to the API (src/shared/api.ts). A refusal ({ error, message } with an HTTP status)
 * throws the server's own words; no server at all (`npm run dev` answers with the app's page)
 * comes back as an empty object, so callers check the shape they expect.
 */
export async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/${path}`, {
    method,
    credentials: 'same-origin',
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const json = (r.headers.get('content-type') ?? '').includes('application/json');
  const data: unknown = json ? await r.json().catch(() => ({})) : {};
  if (!r.ok) throw new Error((data as { message?: string }).message ?? `The server said no (HTTP ${r.status}).`);
  return data as T;
}

/** An error's text, for a toast or a red line. */
export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
