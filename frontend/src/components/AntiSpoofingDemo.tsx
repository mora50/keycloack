import { useState } from "react";
import { call } from "../api/client";
import type { ProductsResponse, RequestRecord } from "../types";
import { DemoCard } from "./DemoCard";

interface AntiSpoofingDemoProps {
  token: string;
  realSub: string | undefined;
  onRecord: (r: RequestRecord) => void;
}

export function AntiSpoofingDemo({ token, realSub, onRecord }: AntiSpoofingDemoProps) {
  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState<RequestRecord | undefined>();
  const [body, setBody] = useState<ProductsResponse | null>(null);
  const fakeUser = "attacker-00000000";

  async function run() {
    setLoading(true);
    const result = await call<ProductsResponse>({
      path: "/api/products",
      token,
      extraHeaders: {
        "X-User-Id": fakeUser,
        "X-Claim-email": "evil@example.com",
        "X-Claim-preferred_username": "attacker",
      },
    });
    setLast(result.record);
    onRecord(result.record);
    if (result.ok && result.body) setBody(result.body);
    setLoading(false);
  }

  const overridden = body && body.user_id !== fakeUser;

  return (
    <DemoCard
      title="Anti-spoofing (FR-010)"
      badge={<span className="pill-danger">teste de injeção</span>}
      description={
        <>
          Vamos enviar headers maliciosos a partir do navegador:
          <code className="ml-1 font-mono text-rose-300">
            X-User-Id: {fakeUser}
          </code>
          . O Kong precisa <em>removê-los</em> antes de validar o token e re-injetar
          os headers reais. O backend nunca deve ver o valor falso.
        </>
      }
      cta={
        <button onClick={run} disabled={loading} className="btn-danger">
          {loading ? "Tentando…" : "Tentar spoof"}
        </button>
      }
      lastRecord={last}
      highlight={
        body && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              overridden
                ? "border-emerald-400/30 bg-emerald-500/[0.06] text-emerald-200"
                : "border-rose-400/30 bg-rose-500/[0.06] text-rose-200"
            }`}
          >
            {overridden ? (
              <>
                Anti-spoofing OK ✓ — backend recebeu{" "}
                <span className="font-mono text-white">{body.user_id}</span>{" "}
                {realSub && body.user_id === realSub
                  ? "(seu sub real)"
                  : ""}
                , não <span className="font-mono text-rose-300">{fakeUser}</span>.
              </>
            ) : (
              <>
                Falha de anti-spoofing! O backend recebeu{" "}
                <span className="font-mono text-white">{body.user_id}</span>.
                Verifique <code>strip_client_headers: true</code> no plugin Lua.
              </>
            )}
          </div>
        )
      }
    />
  );
}
