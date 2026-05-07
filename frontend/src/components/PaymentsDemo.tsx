import { useState } from "react";
import { call } from "../api/client";
import type { PaymentResponse, RequestRecord } from "../types";
import { DemoCard } from "./DemoCard";

interface PaymentsDemoProps {
  token: string;
  onRecord: (r: RequestRecord) => void;
}

export function PaymentsDemo({ token, onRecord }: PaymentsDemoProps) {
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("199.90");
  const [last, setLast] = useState<RequestRecord | undefined>();
  const [body, setBody] = useState<PaymentResponse | null>(null);

  async function run() {
    setLoading(true);
    const result = await call<PaymentResponse>({
      method: "POST",
      path: "/api/payments",
      token,
      body: { amount: Number(amount), currency: "BRL" },
    });
    setLast(result.record);
    onRecord(result.record);
    if (result.ok && result.body) setBody(result.body);
    setLoading(false);
  }

  return (
    <DemoCard
      title="Criar pagamento (rota protegida)"
      badge={<span className="pill-info">POST /api/payments</span>}
      description={
        <>
          Mesma proteção do <code>/api/products</code>: o <code>ms-payments</code>{" "}
          confia em <code className="font-mono text-emerald-300">X-User-Id</code>{" "}
          injetado pelo Kong.
        </>
      }
      cta={
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Valor</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input w-28"
            inputMode="decimal"
          />
          <button onClick={run} disabled={loading} className="btn-primary">
            {loading ? "Enviando…" : "Pagar"}
          </button>
        </div>
      }
      lastRecord={last}
      highlight={
        body && (
          <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] p-3 text-sm text-emerald-200">
            Pagamento{" "}
            <span className="font-mono text-white">{body.payment_id}</span>{" "}
            <span className="text-emerald-300">{body.status}</span> para o
            usuário <span className="font-mono text-white">{body.user_id}</span>.
          </div>
        )
      }
    />
  );
}
