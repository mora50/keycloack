interface StatusPillProps {
  status?: number;
  expectedFailure?: boolean;
  error?: string;
}

export function StatusPill({ status, expectedFailure, error }: StatusPillProps) {
  if (error) {
    return <span className="pill-danger">network error</span>;
  }
  if (status === undefined) return <span className="pill-muted">—</span>;
  const isOk = status >= 200 && status < 300;
  const isExpectedFailure = !isOk && expectedFailure;
  if (isOk) return <span className="pill-success">{status} ok</span>;
  if (isExpectedFailure) return <span className="pill-info">{status} esperado</span>;
  return <span className="pill-danger">{status}</span>;
}
