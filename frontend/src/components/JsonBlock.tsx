interface JsonBlockProps {
  data: unknown;
  className?: string;
  maxHeight?: number;
}

export function JsonBlock({ data, className = "", maxHeight = 320 }: JsonBlockProps) {
  let pretty: string;
  if (typeof data === "string") {
    pretty = data;
  } else if (data === null || data === undefined) {
    pretty = "—";
  } else {
    try {
      pretty = JSON.stringify(data, null, 2);
    } catch {
      pretty = String(data);
    }
  }

  return (
    <pre
      className={`code-block scrollbar-thin overflow-auto rounded-lg bg-slate-950/70 p-3 ring-1 ring-white/5 ${className}`}
      style={{ maxHeight }}
    >
      {pretty}
    </pre>
  );
}
