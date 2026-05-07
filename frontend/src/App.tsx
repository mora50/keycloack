import { useCallback, useEffect, useMemo, useState } from "react";
import { call, getApiBase } from "./api/client";
import { AntiSpoofingDemo } from "./components/AntiSpoofingDemo";
import { ArchitectureDiagram } from "./components/ArchitectureDiagram";
import { LoginCard } from "./components/LoginCard";
import { PaymentsDemo } from "./components/PaymentsDemo";
import { ProductsDemo } from "./components/ProductsDemo";
import { RequestLog } from "./components/RequestLog";
import { TokenCard } from "./components/TokenCard";
import { UnauthDemo } from "./components/UnauthDemo";
import type { RequestRecord, TokenResponse } from "./types";
import { decodeJwt } from "./utils/jwt";

const STORAGE_KEY = "atg.tokens";

export default function App() {
  const [tokens, setTokens] = useState<TokenResponse | null>(null);
  const [records, setRecords] = useState<RequestRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setTokens(JSON.parse(raw));
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (tokens) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [tokens]);

  const apiBase = useMemo(() => getApiBase(), []);
  const decoded = useMemo(
    () => (tokens ? decodeJwt(tokens.access_token) : null),
    [tokens]
  );

  const pushRecord = useCallback((record: RequestRecord) => {
    setRecords((prev) => [...prev, record].slice(-50));
  }, []);

  const refresh = useCallback(async () => {
    if (!tokens?.refresh_token) return;
    setRefreshing(true);
    setRefreshError(null);
    const result = await call<TokenResponse>({
      method: "POST",
      path: "/auth/refresh",
      body: { refresh_token: tokens.refresh_token },
    });
    pushRecord(result.record);
    if (result.ok && result.body && "access_token" in result.body) {
      setTokens(result.body);
    } else {
      setRefreshError(
        result.record.error ??
          `Falha ao renovar token (HTTP ${result.status}). Faça login novamente.`
      );
    }
    setRefreshing(false);
  }, [tokens?.refresh_token, pushRecord]);

  const logout = useCallback(() => {
    setTokens(null);
    setRefreshError(null);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="pill-info">POC · Auth Trust Gateway</span>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Demo interativa do{" "}
            <span className="text-gateway-300">jwt-keycloak-validator</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Login no <code className="font-mono">ms-auth</code>, validação JWT no
            Kong via plugin Lua, e propagação de identidade por{" "}
            <code className="font-mono text-emerald-300">X-User-Id</code> para os
            microsserviços downstream — tudo passando exclusivamente pelo gateway.
          </p>
        </div>
        <div className="rounded-lg border border-white/5 bg-slate-950/40 p-3 text-right text-xs text-slate-400">
          <div>
            API base:{" "}
            <code className="font-mono text-gateway-200">{apiBase}</code>
          </div>
          <div className="mt-1">
            Sessão:{" "}
            {tokens ? (
              <span className="text-emerald-300">autenticada</span>
            ) : (
              <span className="text-slate-300">anônima</span>
            )}
          </div>
        </div>
      </header>

      {!tokens ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <LoginCard
            onLogin={(t) => {
              setTokens(t);
              setRefreshError(null);
            }}
            onRecord={pushRecord}
          />
          <ArchitectureDiagram />
        </div>
      ) : (
        <div className="grid gap-6">
          <TokenCard
            tokens={tokens}
            onRefresh={refresh}
            refreshing={refreshing}
            onLogout={logout}
          />

          {refreshError && (
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              {refreshError}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <ProductsDemo token={tokens.access_token} onRecord={pushRecord} />
            <PaymentsDemo token={tokens.access_token} onRecord={pushRecord} />
            <AntiSpoofingDemo
              token={tokens.access_token}
              realSub={decoded?.subject}
              onRecord={pushRecord}
            />
            <UnauthDemo onRecord={pushRecord} />
          </div>

          <ArchitectureDiagram />
        </div>
      )}

      <div className="mt-6">
        <RequestLog records={records} onClear={() => setRecords([])} />
      </div>

      <footer className="mt-10 border-t border-white/5 pt-4 text-center text-xs text-slate-500">
        POC: <code className="font-mono">specs/001-auth-trust-gateway</code> ·
        Kong 3.9.1 · Keycloak 26.6.1 · Spring Boot 4.0.6 · Vite + React
      </footer>
    </div>
  );
}
