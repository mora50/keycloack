import type { RequestRecord } from "../types";

/**
 * Resolves the API base URL.
 *
 * Priority:
 *  1. `VITE_API_BASE` env var (e.g. http://localhost:8000)
 *  2. `/api-proxy` (Vite dev proxy → http://localhost:8000), used when running
 *     `npm run dev` against a Kong without CORS or in CI.
 *  3. `http://localhost:8000` as the safe default for the POC compose stack.
 */
export function getApiBase(): string {
  const fromEnv = import.meta.env.VITE_API_BASE;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "http://localhost:8000";
  }
  return "http://localhost:8000";
}

export interface CallResult<T = unknown> {
  ok: boolean;
  status: number;
  body: T | null;
  record: RequestRecord;
}

interface CallOptions {
  method?: string;
  path: string;
  body?: unknown;
  token?: string | null;
  extraHeaders?: Record<string, string>;
  /**
   * Marks the request as an "intentional failure" demo — the UI will render
   * a non-2xx response as a *passing* expectation instead of an error toast.
   */
  expectFailure?: boolean;
}

let recordCounter = 0;

export async function call<T = unknown>({
  method = "GET",
  path,
  body,
  token,
  extraHeaders,
  expectFailure,
}: CallOptions): Promise<CallResult<T>> {
  const base = getApiBase();
  const url = path.startsWith("http") ? path : `${base}${path}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...extraHeaders,
  };
  if (body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const startedAt = performance.now();
  const id = `r${++recordCounter}-${Date.now()}`;

  const record: RequestRecord = {
    id,
    method,
    url,
    durationMs: 0,
    requestHeaders: { ...headers },
    responseHeaders: {},
    requestBody: body,
    startedAt: Date.now(),
    expectedFailure: expectFailure,
  };

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    record.durationMs = Math.round(performance.now() - startedAt);
    record.status = response.status;
    record.statusText = response.statusText;
    response.headers.forEach((value, key) => {
      record.responseHeaders[key] = value;
    });

    const text = await response.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    record.responseBody = parsed;

    return {
      ok: response.ok,
      status: response.status,
      body: parsed as T,
      record,
    };
  } catch (err) {
    record.durationMs = Math.round(performance.now() - startedAt);
    record.error = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, body: null, record };
  }
}
