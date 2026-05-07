import type { ReactNode } from "react";
import type { RequestRecord } from "../types";
import { JsonBlock } from "./JsonBlock";
import { StatusPill } from "./StatusPill";

interface DemoCardProps {
  title: string;
  badge: ReactNode;
  description: ReactNode;
  cta: ReactNode;
  lastRecord?: RequestRecord;
  highlight?: ReactNode;
}

export function DemoCard({
  title,
  badge,
  description,
  cta,
  lastRecord,
  highlight,
}: DemoCardProps) {
  return (
    <section className="card-padded flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {badge}
          <h2 className="mt-2 text-lg font-semibold text-white">{title}</h2>
          <div className="mt-1 text-sm text-slate-400">{description}</div>
        </div>
        <div>{cta}</div>
      </header>

      {highlight}

      {lastRecord && (
        <div className="rounded-lg border border-white/5 bg-slate-950/40 p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300">
              {lastRecord.method} {new URL(lastRecord.url).pathname}
            </span>
            <div className="flex items-center gap-2 text-slate-500">
              <span>{lastRecord.durationMs}ms</span>
              <StatusPill
                status={lastRecord.status}
                expectedFailure={lastRecord.expectedFailure}
                error={lastRecord.error}
              />
            </div>
          </div>
          <JsonBlock
            data={
              lastRecord.error
                ? { network_error: lastRecord.error }
                : lastRecord.responseBody
            }
            maxHeight={220}
          />
        </div>
      )}
    </section>
  );
}
