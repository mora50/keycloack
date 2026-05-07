import { useEffect, useState } from "react";
import type { TokenResponse } from "../types";
import { decodeJwt, timeUntil } from "../utils/jwt";
import { JsonBlock } from "./JsonBlock";

interface TokenCardProps {
  tokens: TokenResponse;
  onRefresh: () => Promise<void> | void;
  refreshing: boolean;
  onLogout: () => void;
}

export function TokenCard({ tokens, onRefresh, refreshing, onLogout }: TokenCardProps) {
  const decoded = decodeJwt(tokens.access_token);
  const [, force] = useState(0);

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const accessPreview =
    tokens.access_token.length > 60
      ? `${tokens.access_token.slice(0, 30)}…${tokens.access_token.slice(-10)}`
      : tokens.access_token;

  const expired = decoded?.expiresAt ? decoded.expiresAt.getTime() <= Date.now() : false;

  return (
    <section className="card-padded">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="pill-success">access_token RS256</span>
          <h2 className="mt-2 text-xl font-semibold text-white">Sessão atual</h2>
          <p className="text-sm text-slate-400">
            Token emitido pelo Keycloak, recebido pelo navegador através do{" "}
            <strong className="text-slate-200">Kong → ms-auth</strong>.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onRefresh} className="btn-secondary" disabled={refreshing}>
            {refreshing ? "Renovando…" : "Renovar token"}
          </button>
          <button onClick={onLogout} className="btn-danger">
            Encerrar sessão
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Stat
          label="Subject (sub)"
          value={decoded?.subject ?? "—"}
          mono
        />
        <Stat
          label="preferred_username"
          value={decoded?.preferredUsername ?? "—"}
        />
        <Stat label="email" value={decoded?.email ?? "—"} />
        <Stat
          label="Expira em"
          value={expired ? "expirado" : timeUntil(decoded?.expiresAt)}
          highlight={expired ? "danger" : "success"}
        />
        <Stat
          label="Refresh expira em"
          value={
            tokens.refresh_expires_in
              ? `${Math.floor(tokens.refresh_expires_in / 60)}m janela inicial`
              : "—"
          }
        />
        <Stat
          label="Algoritmo / kid"
          value={`${decoded?.header.alg ?? "?"} · ${decoded?.header.kid ?? "?"}`}
          mono
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Header</h3>
            <span className="text-[11px] text-slate-500">decodificado no client</span>
          </div>
          <JsonBlock data={decoded?.header ?? {}} maxHeight={200} />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Payload (claims)</h3>
            <span className="text-[11px] text-slate-500">
              assinatura: <code>{decoded?.signaturePreview}</code>
            </span>
          </div>
          <JsonBlock data={decoded?.payload ?? {}} maxHeight={200} />
        </div>
      </div>

      <details className="mt-4 rounded-lg border border-white/5 bg-slate-950/40 p-3 text-xs text-slate-400">
        <summary className="cursor-pointer font-mono text-slate-300">
          access_token bruto ({accessPreview})
        </summary>
        <textarea
          readOnly
          className="mt-2 h-32 w-full resize-none rounded-md bg-slate-950/80 p-2 font-mono text-[11px] text-slate-200 ring-1 ring-white/5"
          value={tokens.access_token}
        />
      </details>
    </section>
  );
}

function Stat({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: "success" | "danger";
}) {
  const colorClass =
    highlight === "danger"
      ? "text-rose-300"
      : highlight === "success"
        ? "text-emerald-300"
        : "text-slate-100";
  return (
    <div className="rounded-lg border border-white/5 bg-slate-950/30 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`mt-1 truncate text-sm font-medium ${colorClass} ${
          mono ? "font-mono" : ""
        }`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
