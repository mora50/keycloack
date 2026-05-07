import type { DecodedJwt } from "../types";

function base64UrlDecode(input: string): string {
  let padded = input.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4 !== 0) padded += "=";
  const binary = atob(padded);
  try {
    return decodeURIComponent(
      Array.from(binary)
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
  } catch {
    return binary;
  }
}

/**
 * Client-side JWT decoder. **No signature verification** — that is Kong's job
 * and the whole point of the POC. We use this strictly to render the claims
 * pretty in the UI so people can see what's inside the token they just got.
 */
export function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(base64UrlDecode(parts[0])) as Record<string, unknown>;
    const payload = JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;

    const exp = typeof payload.exp === "number" ? payload.exp : undefined;
    const iat = typeof payload.iat === "number" ? payload.iat : undefined;

    return {
      header,
      payload,
      signaturePreview: parts[2].slice(0, 16) + "…",
      expiresAt: exp ? new Date(exp * 1000) : undefined,
      issuedAt: iat ? new Date(iat * 1000) : undefined,
      subject: typeof payload.sub === "string" ? payload.sub : undefined,
      preferredUsername:
        typeof payload.preferred_username === "string"
          ? (payload.preferred_username as string)
          : undefined,
      email: typeof payload.email === "string" ? (payload.email as string) : undefined,
    };
  } catch {
    return null;
  }
}

export function timeUntil(date: Date | undefined): string {
  if (!date) return "—";
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return "expirado";
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${remaining.toString().padStart(2, "0")}s`;
}
