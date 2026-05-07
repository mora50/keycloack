import { useState } from "react";
import type { RequestRecord } from "../types";
import { JsonBlock } from "./JsonBlock";
import { StatusPill } from "./StatusPill";

interface RequestLogProps {
  records: RequestRecord[];
  onClear: () => void;
}

function summarizeHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === "authorization" && v.toLowerCase().startsWith("bearer ")) {
      out[k] = `Bearer ${v.slice(7, 23)}…(${v.length - 7} chars)`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function RequestLog({ records, onClear }: RequestLogProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const reversed = [...records].reverse();

  return (
    <section className="card-padded">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            Histórico de chamadas via Kong
          </h2>
          <p className="text-xs text-slate-400">
            Tudo o que esta página envia para <code className="font-mono">localhost:8000</code>{" "}
            (Kong) é registrado aqui.
          </p>
        </div>
        <button
          onClick={onClear}
          disabled={records.length === 0}
          className="btn-secondary"
        >
          Limpar histórico
        </button>
      </header>

      {records.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-sm text-slate-400">
          Nenhuma chamada ainda. Faça login ou execute um dos demos para ver as
          requisições aparecerem aqui.
        </p>
      ) : (
        <ul className="divide-y divide-white/5 rounded-lg border border-white/5 bg-slate-950/40">
          {reversed.map((r) => {
            const open = openId === r.id;
            return (
              <li key={r.id}>
                <button
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="pill-muted font-mono uppercase">{r.method}</span>
                    <span className="truncate font-mono text-xs text-slate-300">
                      {r.url}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">{r.durationMs}ms</span>
                    <StatusPill
                      status={r.status}
                      expectedFailure={r.expectedFailure}
                      error={r.error}
                    />
                    <span
                      className={`text-slate-500 transition ${open ? "rotate-180" : ""}`}
                    >
                      ▾
                    </span>
                  </div>
                </button>
                {open && (
                  <div className="grid gap-3 border-t border-white/5 bg-slate-950/60 px-4 py-3 lg:grid-cols-2">
                    <div>
                      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Request headers
                      </h4>
                      <JsonBlock data={summarizeHeaders(r.requestHeaders)} maxHeight={200} />
                      {r.requestBody !== undefined && (
                        <>
                          <h4 className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Request body
                          </h4>
                          <JsonBlock data={r.requestBody} maxHeight={160} />
                        </>
                      )}
                    </div>
                    <div>
                      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Response headers
                      </h4>
                      <JsonBlock data={r.responseHeaders} maxHeight={200} />
                      <h4 className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Response body
                      </h4>
                      {r.error ? (
                        <JsonBlock data={{ network_error: r.error }} maxHeight={160} />
                      ) : (
                        <JsonBlock data={r.responseBody} maxHeight={160} />
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
