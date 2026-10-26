import { createContext, useContext, type ReactNode } from "react";
import { useStoredState } from "./hooks/useStoredState";
import { DEFAULT_POLICIES, type StorePolicies } from "./lib/legal";
import type { Profile, Progress, TaskStatus } from "./types";

export const EMPTY_PROFILE: Profile = {
  firstName: "",
  hasCompany: true,
  country: "FR",
  legalForm: "",
  budget: 1000,
  addressType: "unknown",
  companyName: "",
  registrationNumber: "",
  vatNumber: "",
  address: "",
  email: "",
  phone: "",
  storeName: "",
  storeUrl: "",
};

interface AppState {
  profile: Profile | null;
  setProfile: (p: Profile) => void;
  progress: Progress;
  setTaskStatus: (taskId: string, status: TaskStatus | null) => void;
  notes: Record<string, string>;
  setNote: (taskId: string, note: string) => void;
  policies: StorePolicies;
  setPolicies: (p: StorePolicies) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useStoredState<Profile | null>("profile", null);
  const [progress, setProgress] = useStoredState<Progress>("progress", {});
  const [notes, setNotes] = useStoredState<Record<string, string>>("notes", {});
  const [policies, setPolicies] = useStoredState<StorePolicies>("policies", DEFAULT_POLICIES);

  function setTaskStatus(taskId: string, status: TaskStatus | null) {
    setProgress((prev) => {
      const next = { ...prev };
      if (status) next[taskId] = status;
      else delete next[taskId];
      return next;
    });
  }

  function setNote(taskId: string, note: string) {
    setNotes((prev) => ({ ...prev, [taskId]: note }));
  }

  return (
    <Ctx.Provider
      value={{
        profile: profile ? { ...EMPTY_PROFILE, ...profile } : null,
        setProfile,
        progress,
        setTaskStatus,
        notes,
        setNote,
        policies: { ...DEFAULT_POLICIES, ...policies },
        setPolicies,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppState doit être utilisé dans AppStateProvider");
  return ctx;
}
