export type Country = "FR" | "BE" | "CH" | "LU";

export type AddressType = "home" | "domiciliation" | "office" | "unknown";

/** Profil saisi à l'inscription, utilisé pour adapter le parcours et pré-remplir les outils. */
export interface Profile {
  firstName: string;
  hasCompany: boolean;
  country: Country;
  legalForm: string;
  budget: number;
  addressType: AddressType;
  // Identité légale, reprise par le générateur de pages légales.
  companyName: string;
  registrationNumber: string;
  vatNumber: string;
  address: string;
  email: string;
  phone: string;
  storeName: string;
  storeUrl: string;
}

export type ToolId = "profit" | "score" | "ads" | "legal" | "gmc";

export interface Faq {
  q: string;
  a: string;
}

export interface Task {
  id: string;
  title: string;
  /** Pourquoi la tâche compte, en une ou deux phrases. */
  why: string;
  /** Actions concrètes, dans l'ordre. */
  steps: string[];
  /** Ce que l'utilisateur doit noter ou avoir en main à la fin. */
  deliverable?: string;
  cost?: string;
  tool?: ToolId;
  faq?: Faq[];
  /** Si absent, la tâche s'affiche pour tout le monde. */
  showIf?: (profile: Profile) => boolean;
}

export interface Module {
  id: string;
  number: number;
  title: string;
  summary: string;
  tasks: Task[];
}

export type TaskStatus = "done" | "skipped";

export type Progress = Record<string, TaskStatus>;
