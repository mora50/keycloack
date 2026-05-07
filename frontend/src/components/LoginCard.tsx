import { useState } from "react";
import { call } from "../api/client";
import type { ErrorResponse, RequestRecord, TokenResponse } from "../types";

interface LoginCardProps {
  onLogin: (tokens: TokenResponse) => void;
  onRecord: (record: RequestRecord) => void;
}

export function LoginCard({ onLogin, onRecord }: LoginCardProps) {
  const [username, setUsername] = useState("alice");
  const [password, setPassword] = useState("alice");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await call<TokenResponse | ErrorResponse>({
      method: "POST",
      path: "/auth/login",
      body: { username, password },
    });
    onRecord(result.record);
    setLoading(false);
    if (result.ok && result.body && "access_token" in (result.body as object)) {
      onLogin(result.body as TokenResponse);
      return;
    }
    if (result.record.error) {
      setError(
        `Falha de rede ao chamar Kong: ${result.record.error}. Verifique se 'docker compose up' está em execução e se o CORS está habilitado.`
      );
      return;
    }
    const errBody = (result.body as ErrorResponse) ?? {};
    setError(
      errBody.error_description ??
        errBody.error ??
        `Login falhou (HTTP ${result.status}).`
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="card-padded">
        <header className="mb-5">
          <span className="pill-info">POST /auth/login</span>
          <h1 className="mt-3 text-2xl font-semibold text-white">
            Login via{" "}
            <span className="text-gateway-300">ms-auth</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            O <strong className="text-slate-200">ms-auth</strong> é o único componente
            da stack autorizado a falar com o Keycloak. O navegador envia as
            credenciais para o Kong (porta 8000), que encaminha para o BFF.
          </p>
        </header>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="username">
              Usuário
            </label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Autenticando…" : "Entrar"}
          </button>

          <p className="rounded-lg border border-white/5 bg-slate-950/50 p-3 text-xs text-slate-400">
            Credenciais padrão da POC:{" "}
            <code className="font-mono text-slate-200">alice / alice</code>
            <br />A senha é enviada ao Keycloak como{" "}
            <code className="font-mono">grant_type=password</code> exclusivamente
            pelo ms-auth — esse fluxo é apenas para a POC.
          </p>
        </form>
      </div>
    </div>
  );
}
