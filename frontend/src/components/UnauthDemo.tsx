import { useState } from "react";
import { call } from "../api/client";
import type { RequestRecord } from "../types";
import { DemoCard } from "./DemoCard";

interface UnauthDemoProps {
  onRecord: (r: RequestRecord) => void;
}

export function UnauthDemo({ onRecord }: UnauthDemoProps) {
  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState<RequestRecord | undefined>();

  async function run() {
    setLoading(true);
    const result = await call({
      path: "/api/products",
      expectFailure: true,
    });
    setLast(result.record);
    onRecord(result.record);
    setLoading(false);
  }

  const status = last?.status;
  const blockedAtGateway = status === 401 || status === 403;

  return (
    <DemoCard
      title="Sem token → bloqueado pelo Kong"
      badge={<span className="pill-muted">controle</span>}
      description={
        <>
          Chamada direta ao gateway sem cabeçalho{" "}
          <code className="font-mono">Authorization</code>. O plugin custom
          deve responder <code>401</code> sem nem encostar no upstream.
        </>
      }
      cta={
        <button onClick={run} disabled={loading} className="btn-secondary">
          {loading ? "Chamando…" : "Tentar sem token"}
        </button>
      }
      lastRecord={last}
      highlight={
        last && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              blockedAtGateway
                ? "border-emerald-400/30 bg-emerald-500/[0.06] text-emerald-200"
                : "border-amber-400/30 bg-amber-500/[0.06] text-amber-200"
            }`}
          >
            {blockedAtGateway
              ? `Gateway respondeu ${status}: requisição bloqueada antes de chegar no microsserviço. ✓`
              : `Resposta inesperada (HTTP ${status ?? "—"}). Cheque o jwt-keycloak-validator.`}
          </div>
        )
      }
    />
  );
}
