/**
 * Typed API client for the Lummina backend.
 *
 * Attaches the JWT from sessionStorage on every request, normalizes errors,
 * and handles 401 by clearing the token (the auth context re-checks on next
 * focus). Never logs the token.
 *
 * Why sessionStorage, not localStorage: the token is gone when the tab
 * closes, limiting exposure from XSS. The tradeoff is that "remember me"
 * across browser restarts isn't supported — acceptable for this app, and
 * the right default for security.
 */

const TOKEN_KEY = "lumina.token";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

type FetchOpts = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Set to true for multipart/form-data uploads — skips JSON content-type. */
  formData?: FormData;
  signal?: AbortSignal;
};

async function request<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!opts.formData) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.formData ?? (opts.body ? JSON.stringify(opts.body) : undefined),
    signal: opts.signal,
  });

  // 204 No Content
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (res.status === 401) setToken(null); // force re-auth
    const message = data?.error || `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", formData }),
};

// ---------------------------------------------------------------------------
// Typed response shapes — mirror the backend's zod schemas / route contracts
// ---------------------------------------------------------------------------

export type Tier = "free" | "atelier" | "master";
export type SkillTier = "beginner" | "intermediate" | "master";

export type User = {
  id: number;
  name: string;
  email: string;
  tier: Tier;
  role: "user" | "admin";
  emailVerifiedAt: string | null;
  analysesUsedThisPeriod: number;
};

export type ScoreSet = { val: string; comp: string; edge: string; light: string };
export type ValueZone = { name: string; val: string; bar: number; c: string };
export type CompRule = { icon: string; name: string; desc: string; score: string };
export type BrushStat = { lbl: string; val: string; sub: string };
export type BrushTech = { name: string; desc: string };
export type StyleMatch = {
  rank: string; name: string; era: string; tags: string[]; pct: string;
};
export type GlazeLayer = {
  step: string; name: string; desc: string; pigs: string[]; // flat [hex,name,...]
};
export type PaletteSwatch = { hex: string; name: string; share: number; rgb: [number, number, number] };

/** Shape returned by GET /api/analysis/:id and POST /api/analysis. */
export type AnalysisResult = {
  id: number | string;
  imageHash?: string;
  imageUrl?: string;
  analysis: {
    crit: { scores: ScoreSet; blocks: { cat: string; text: string }[]; mentor: string };
    vmap: { zones: ValueZone[]; mentor: string };
    comp: { rules: CompRule[]; mentor: string };
    brush: { stats: BrushStat[]; techs: BrushTech[]; mentor: string };
    style: { matches: StyleMatch[]; mentor: string };
    glaze: { layers: GlazeLayer[]; mentor: string };
  };
  palette: PaletteSwatch[];
  provenance: Record<string, unknown>;
  proseSource: "llm" | "template";
};

export type UploadResponse = {
  uploadId: string;
  url: string;
  sha256: string;
  width: number;
  height: number;
  mime: string;
};

export type CheckoutResponse = {
  method: "payfast";
  payment: { id: number };
  actionUrl: string;
  fields: Record<string, string>;
};
