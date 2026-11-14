export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** JSON fetch against the Homy API with readable errors. */
export async function requestJson<T>(url: string, init: RequestInit & { json?: unknown } = {}, headers: Record<string, string> = {}): Promise<T> {
  const { json, ...rest } = init;
  const h: Record<string, string> = { Accept: 'application/json', ...headers, ...(rest.headers as Record<string, string> || {}) };
  if (json !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(url, { credentials: 'same-origin', ...rest, headers: h, body: json !== undefined ? JSON.stringify(json) : rest.body });
  const text = await res.text();
  let data: unknown = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!res.ok) {
    const d = data as { message?: string; error?: string } | null;
    const html = /^\s*</.test(text);
    throw new ApiError(d?.message || d?.error || (html ? `HTTP ${res.status} – ${url}` : text.slice(0, 200)) || `HTTP ${res.status}`, res.status);
  }
  return data as T;
}
