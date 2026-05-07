import { useState } from "react";
import { call } from "../api/client";
import type { ProductsResponse, RequestRecord } from "../types";
import { DemoCard } from "./DemoCard";

interface ProductsDemoProps {
  token: string;
  onRecord: (r: RequestRecord) => void;
}

export function ProductsDemo({ token, onRecord }: ProductsDemoProps) {
  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState<RequestRecord | undefined>();
  const [body, setBody] = useState<ProductsResponse | null>(null);

  async function run() {
    setLoading(true);
    const result = await call<ProductsResponse>({
      path: "/api/products",
      token,
    });
    setLast(result.record);
    onRecord(result.record);
    if (result.ok && result.body) setBody(result.body);
    setLoading(false);
  }

  return (
    <DemoCard
      title="Listar produtos (rota protegida)"
      badge={<span className="pill-info">GET /api/products</span>}
      description={
        <>
          Kong valida o JWT localmente, extrai a claim <code>sub</code> e injeta{" "}
          <code className="font-mono text-emerald-300">X-User-Id</code> no upstream.
          O <code>ms-products</code> apenas confia nesse header — ele não
          valida o token.
        </>
      }
      cta={
        <button onClick={run} disabled={loading} className="btn-primary">
          {loading ? "Chamando…" : "Chamar Kong"}
        </button>
      }
      lastRecord={last}
      highlight={
        body && (
          <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] p-3 text-sm text-emerald-200">
            <div>
              <code className="font-mono text-emerald-300">X-User-Id</code> recebido
              pelo serviço:{" "}
              <span className="font-mono text-white">{body.user_id}</span>
            </div>
            {body.preferred_username && (
              <div>
                <code className="font-mono text-emerald-300">X-Claim-preferred_username</code>:{" "}
                <span className="font-mono text-white">{body.preferred_username}</span>
              </div>
            )}
            {body.email && (
              <div>
                <code className="font-mono text-emerald-300">X-Claim-email</code>:{" "}
                <span className="font-mono text-white">{body.email}</span>
              </div>
            )}
            <div className="mt-2 text-xs text-emerald-300/80">
              {body.products.length} produto(s) retornado(s) pelo backend.
            </div>
          </div>
        )
      }
    />
  );
}
