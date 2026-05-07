export function ArchitectureDiagram() {
  return (
    <section className="card-padded">
      <header className="mb-4">
        <span className="pill-muted">arquitetura</span>
        <h2 className="mt-2 text-lg font-semibold text-white">
          O que está acontecendo nos bastidores?
        </h2>
        <p className="text-sm text-slate-400">
          O navegador só conhece um endpoint público:{" "}
          <code className="font-mono text-gateway-200">
            http://localhost:8000
          </code>{" "}
          (Kong). Tudo o mais vive na rede privada do Docker Compose.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <Node title="Frontend" subtitle="React (este app)" tone="neutral" />
        <Arrow label="HTTPS/CORS" />
        <Node
          title="Kong Gateway"
          subtitle="jwt-keycloak-validator (Lua)"
          tone="primary"
          notes={[
            "Strip X-User-Id do cliente",
            "Valida assinatura RS256 com JWKS",
            "Injeta X-User-Id real",
          ]}
        />
        <Arrow label="X-User-Id" />
        <Node
          title="ms-products / ms-payments"
          subtitle="Spring Boot 4 (virtual threads)"
          tone="success"
          notes={["Confia em X-User-Id", "Não valida JWT"]}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-white/5 bg-slate-950/40 p-4">
          <h4 className="mb-2 text-sm font-semibold text-slate-100">
            Fluxo de login (POST /auth/login)
          </h4>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
            <li>Browser → Kong (porta 8000)</li>
            <li>Kong → ms-auth (rede interna)</li>
            <li>ms-auth → Keycloak (grant_type=password)</li>
            <li>access_token + refresh_token retornam ao browser</li>
          </ol>
        </div>
        <div className="rounded-lg border border-white/5 bg-slate-950/40 p-4">
          <h4 className="mb-2 text-sm font-semibold text-slate-100">
            Fluxo de chamada protegida
          </h4>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
            <li>Browser → Kong com{" "}
              <code className="font-mono">Authorization: Bearer …</code>
            </li>
            <li>
              Plugin Lua busca JWKS em{" "}
              <code className="font-mono">ms-auth:8080/auth/jwks</code> (cacheado)
            </li>
            <li>Valida exp/iss/alg + assinatura RS256</li>
            <li>Injeta <code className="font-mono">X-User-Id</code> e roteia para o serviço</li>
          </ol>
        </div>
      </div>
    </section>
  );
}

function Node({
  title,
  subtitle,
  tone,
  notes,
}: {
  title: string;
  subtitle: string;
  tone: "neutral" | "primary" | "success";
  notes?: string[];
}) {
  const toneClasses =
    tone === "primary"
      ? "border-gateway-400/40 bg-gateway-500/[0.08]"
      : tone === "success"
        ? "border-emerald-400/30 bg-emerald-500/[0.05]"
        : "border-white/10 bg-white/[0.03]";
  return (
    <div className={`rounded-xl border ${toneClasses} p-4 text-center`}>
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">
        {subtitle}
      </div>
      {notes && (
        <ul className="mt-3 space-y-1 text-left text-[11px] text-slate-300">
          {notes.map((n) => (
            <li key={n} className="flex items-start gap-1.5">
              <span className="mt-1 h-1 w-1 flex-none rounded-full bg-slate-500" />
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="hidden flex-col items-center justify-center text-[11px] text-slate-500 lg:flex">
      <div className="text-slate-300">→</div>
      <div className="font-mono">{label}</div>
    </div>
  );
}
