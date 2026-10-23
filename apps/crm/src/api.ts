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
  /** Ouvre un PDF protégé dans un nouvel onglet. */
  async openPdf(path: string) {
    const tab = window.open("", "_blank"); // ouvert tout de suite (bloqueur de fenêtres)
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    });
    if (!res.ok) {
      tab?.close();
      throw new ApiError(res.status, "PDF indisponible.");
    }
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  },
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
    timezone: string;
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
  siren: string | null;
  vat_number: string | null;
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

export interface OrderLineOut {
  product: string;
  quantity: number;
  unit?: string | null;
  notes?: string | null;
}

export interface UpcomingOrder {
  id: string;
  contact: { id: string; name: string; phone: string | null } | null;
  lines: OrderLineOut[];
  slot: string | null;
  location: string | null;
  fulfillment: string | null;
  notes: string | null;
  occurred_at: string;
}

export interface Today {
  date_label: string;
  appointments: {
    today: { id: string; time: string; end: string; type_name: string; status: string; notes: string | null;
             contact: { id: string; name: string; phone: string | null } | null }[];
    tomorrow_count: number;
  } | null;
  invoices: {
    unpaid_count: number;
    unpaid_total: number;
    overdue_count: number;
    overdue_total: number;
    overdue: { id: string; number: string | null; total_ttc: number; remaining: number;
               due_date: string; contact: { id: string; name: string } | null }[];
  } | null;
  quotes: {
    awaiting_count: number;
    awaiting_total_ttc: number;
    awaiting: { id: string; number: string | null; title: string; total_ttc: number;
                sent_at: string | null; contact: { id: string; name: string } | null }[];
  } | null;
  todo: {
    approvals_count: number;
    approvals: { id: string; title: string; summary: string; created_at: string }[];
    callbacks: {
      id: string;
      title: string;
      summary: string | null;
      occurred_at: string;
      contact: { id: string; name: string; phone: string | null } | null;
    }[];
  };
  orders: {
    upcoming: { date: string; label: string; orders: UpcomingOrder[]; totals: OrderLineOut[] }[];
    undated: UpcomingOrder[];
  } | null;
  today: {
    calls: number | null;
    orders: number | null;
    new_contacts: number;
    emails: number | null;
    emails_auto: number | null;
  };
}

export interface EmailStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  gmail: boolean;
  calendar: boolean;
  today: Record<string, number>;
}

export interface SyncResult {
  seen: number;
  ignored: number;
  filed: number;
  auto_sent: number;
  to_validate: number;
  errors: string[];
}

export interface BusinessInfo {
  legal_name: string | null;
  legal_form: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  siret: string | null;
  vat_number: string | null;
  rcs: string | null;
  capital: string | null;
  email: string | null;
  phone: string | null;
  iban: string | null;
  bic: string | null;
  vat_franchise: boolean;
  quote_validity_days: number;
  payment_terms_days: number;
  quote_terms: string | null;
  invoice_terms: string | null;
  missing: string[];
}

export interface QuoteLine {
  description: string;
  detail: string | null;
  catalog_item_id: string | null;
  quantity: string;
  unit: string | null;
  unit_price: string | null;
  vat_rate: string;
}

export type QuoteStatus = "brouillon" | "a_valider" | "envoye" | "accepte" | "refuse" | "expire" | "facture";

export interface QuoteSummary {
  id: string;
  number: string | null;
  status: QuoteStatus;
  title: string;
  total_ht: number;
  total_ttc: number;
  prices_include_vat: boolean;
  source: string;
  contact: { id: string; name: string; email: string | null } | null;
  issue_date: string | null;
  valid_until: string | null;
  sent_at: string | null;
  created_at: string;
  incomplete: boolean;
}

export interface QuoteFull extends QuoteSummary {
  lines: QuoteLine[];
  notes: string | null;
  internal_notes: string | null;
  email_body: string | null;
  reminders_sent: number;
}

export type InvoiceStatus = "brouillon" | "emise" | "partiellement_payee" | "payee" | "annulee";

export interface InvoiceSummary {
  id: string;
  kind: "facture" | "avoir";
  number: string | null;
  status: InvoiceStatus;
  title: string;
  total_ht: number;
  total_vat: number;
  total_ttc: number;
  amount_paid: number;
  remaining: number;
  overdue: boolean;
  contact: { id: string; name: string; email: string | null } | null;
  quote_id: string | null;
  credited_invoice_id: string | null;
  issue_date: string | null;
  due_date: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface InvoiceFull extends InvoiceSummary {
  lines: QuoteLine[];
  notes: string | null;
  prices_include_vat: boolean;
  operation_category: "biens" | "services" | "mixte";
  delivery_date: string | null;
  payments: { id: string; amount: number; method: string; paid_on: string; note: string | null }[];
  credit_notes: { id: string; number: string | null; status: InvoiceStatus; total_ttc: number }[];
}

export interface AppointmentType { id: string; name: string; duration: number; description?: string | null }

export interface AgendaSettings {
  types: AppointmentType[];
  weekly: Record<string, [string, string][]>;
  buffer_min: number;
  step_min: number;
  min_notice_hours: number;
  horizon_days: number;
  location: string | null;
  calendar_id: string;
}

export interface AppointmentOut {
  id: string;
  type_name: string;
  type_id: string;
  start: string;
  end: string;
  status: "a_confirmer" | "confirme" | "annule";
  source: string;
  notes: string | null;
  contact: { id: string; name: string; phone: string | null } | null;
}
