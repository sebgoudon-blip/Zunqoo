// Client de l'API du CRM (voice-agent/src/zunqoo_voice/crm/api.py).

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const TOKEN_KEY = "zunqoo.crm.token";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* stockage indisponible (navigation privée) : session non mémorisée */
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, "Connexion au serveur impossible. Vérifiez votre réseau.");
  }
  if (res.status === 401 && path !== "/api/auth/login") onUnauthorized();
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail)) message = "Certaines informations sont invalides.";
    } catch {
      /* corps non JSON */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: (path: string) => request<void>("DELETE", path),
  async download(path: string, filename: string) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    });
    if (!res.ok) throw new ApiError(res.status, "Téléchargement impossible.");
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  },
};

// --- Types renvoyés par l'API -------------------------------------------------

export interface Me {
  user: { id: string; name: string; email: string; role: "admin" | "membre" };
  business: {
    id: string;
    name: string;
    activity: string;
    default_vat_rate: number;
    prices_include_vat: boolean;
  };
  modules: string[];
}

export type Autonomy = "valider_tout" | "valider_important" | "automatique";

export interface ModuleInfo {
  key: string;
  label: string;
  description: string;
  requires: string[];
  available: boolean;
  has_autonomy: boolean;
  enabled: boolean;
  autonomy: Autonomy;
}

export interface ModulesResponse {
  modules: ModuleInfo[];
  presets: { key: string; label: string; modules: string[] }[];
}

export interface Interaction {
  id: string;
  channel: "appel" | "email" | "whatsapp" | "note" | string;
  direction: string;
  intent: string | null;
  title: string;
  summary: string | null;
  body?: string | null;
  occurred_at: string;
  contact: { id: string; name: string } | null;
  data: Record<string, unknown>;
}

export interface Dashboard {
  pending_approvals: number;
  calls_24h: number;
  orders_7d: number;
  contacts: number;
  recent: Interaction[];
}

export interface Contact {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  last_interaction_at: string | null;
  interactions?: Interaction[];
}

export interface CatalogItem {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  unit: string | null;
  price: number | null;
  price_includes_vat: boolean;
  vat_rate: number;
  price_ht: number | null;
  price_ttc: number | null;
  availability: string | null;
  active: boolean;
  source: "site" | "manuel" | "import";
}

export interface Approval {
  id: string;
  module: string;
  kind: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  status: "en_attente" | "en_cours" | "approuve" | "refuse" | "execute" | "echec";
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_channel: "web" | "whatsapp" | null;
  result: string | null;
  contact: { id: string; name: string } | null;
}
