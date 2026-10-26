import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { clearStoredState } from "../hooks/useStoredState";
import { EMPTY_PROFILE, useAppState } from "../state";
import type { AddressType, Country, Profile } from "../types";

const COUNTRIES: { value: Country; label: string }[] = [
  { value: "FR", label: "France" },
  { value: "BE", label: "Belgique" },
  { value: "CH", label: "Suisse" },
  { value: "LU", label: "Luxembourg" },
];

const ADDRESS_TYPES: { value: AddressType; label: string }[] = [
  { value: "unknown", label: "Je ne sais pas encore" },
  { value: "home", label: "Mon domicile" },
  { value: "domiciliation", label: "Société de domiciliation" },
  { value: "office", label: "Local / bureau" },
];

export function ProfilePage() {
  const { profile, setProfile } = useAppState();
  const [draft, setDraft] = useState<Profile>(profile ?? EMPTY_PROFILE);
  const navigate = useNavigate();
  const isNew = !profile;

  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setProfile(draft);
    navigate("/parcours");
  }

  function reset() {
    if (window.confirm("Effacer ton profil et toute ta progression sur cet appareil ?")) {
      clearStoredState();
      window.location.href = "/";
    }
  }

  const text = (key: keyof Profile, label: string, placeholder = "", type = "text") => (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={String(draft[key])}
        placeholder={placeholder}
        onChange={(e) => update(key, e.target.value as never)}
      />
    </label>
  );

  return (
    <form className="page narrow" onSubmit={submit}>
      <h1>{isNew ? "Faisons connaissance" : "Mon profil"}</h1>
      <p>
        Ces réponses adaptent ton parcours. Les informations légales sont reprises dans le générateur de pages légales :
        elles doivent être identiques partout (site, Merchant Center, Google Ads).
      </p>

      <fieldset className="card">
        <legend>Ton projet</legend>
        {text("firstName", "Prénom et nom", "Camille Martin")}
        <div className="field">
          <span>As-tu déjà une structure juridique ?</span>
          <div className="segmented">
            <button type="button" className={draft.hasCompany ? "on" : ""} onClick={() => update("hasCompany", true)}>
              Oui, déjà créée
            </button>
            <button type="button" className={!draft.hasCompany ? "on" : ""} onClick={() => update("hasCompany", false)}>
              Pas encore
            </button>
          </div>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>Pays du siège</span>
            <select value={draft.country} onChange={(e) => update("country", e.target.value as Country)}>
              {COUNTRIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          {text("legalForm", "Forme juridique", "SASU, micro-entreprise, SRL…")}
        </div>
        <div className="grid-2">
          <label className="field">
            <span>Budget de démarrage (€)</span>
            <input
              type="number"
              min={0}
              step={50}
              value={draft.budget}
              onChange={(e) => update("budget", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>Type d'adresse du siège</span>
            <select value={draft.addressType} onChange={(e) => update("addressType", e.target.value as AddressType)}>
              {ADDRESS_TYPES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Identité légale (tu pourras compléter plus tard)</legend>
        <div className="grid-2">
          {text("companyName", "Raison sociale", "Ma Société SAS")}
          {text("registrationNumber", "N° d'immatriculation", "SIREN, BCE, RCS, IDE…")}
        </div>
        {text("address", "Adresse du siège (exacte)", "12 rue Exemple, 75001 Paris, France")}
        <div className="grid-2">
          {text("vatNumber", "N° de TVA (si existant)", "FR12345678901")}
          {text("phone", "Téléphone de contact", "+33 6 00 00 00 00", "tel")}
        </div>
        <div className="grid-2">
          {text("email", "Email de contact", "contact@tamarque.fr", "email")}
          {text("storeName", "Nom de la boutique", "Ma Marque")}
        </div>
        {text("storeUrl", "URL de la boutique", "https://www.tamarque.fr")}
      </fieldset>

      <div className="form-actions">
        <button className="btn btn-primary btn-large" type="submit">
          {isNew ? "Démarrer mon parcours" : "Enregistrer"}
        </button>
        {!isNew && (
          <button className="btn btn-ghost" type="button" onClick={reset}>
            Tout réinitialiser
          </button>
        )}
      </div>
    </form>
  );
}
