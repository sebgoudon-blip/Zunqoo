"use client";

import { useEffect, useState } from "react";

type Lead = {
  id: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  ville: string;
  statut: string;
  ajouteLe: string;
  contacteLe: string | null;
  optOut: boolean;
};

const VILLES_SUGGESTIONS = [
  "Lyon",
  "Grenoble",
  "Saint-Etienne",
  "Annecy",
  "Chambery",
  "Valence",
  "Villeurbanne",
  "Bourg-en-Bresse",
];

const LIBELLES_STATUT: Record<string, string> = {
  nouveau: "Nouveau",
  contacte: "Contacte",
  interesse: "Interesse",
  converti: "Converti",
  refuse: "Refuse",
};

export default function PageSuperAdminLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [zone, setZone] = useState("Lyon");
  const [recherche, setRecherche] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);

  async function chargerLeads() {
    const res = await fetch("/api/super-admin/leads");
    const data = await res.json();
    if (res.ok) setLeads(data.leads);
  }

  useEffect(() => {
    chargerLeads();
  }, []);

  async function lancerRecherche(e: React.FormEvent) {
    e.preventDefault();
    setRecherche(true);
    setResultat(null);

    const res = await fetch("/api/super-admin/leads/rechercher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zone }),
    });
    const data = await res.json();

    setRecherche(false);

    if (!res.ok) {
      setResultat(data.erreur || "Erreur lors de la recherche.");
      return;
    }

    setResultat(
      `${data.totalTrouves} commerce(s) trouve(s) — ${data.nouveaux} nouveau(x) lead(s), ` +
        `${data.doublons} deja connu(s), ${data.messagesEnvoyes} message(s) envoye(s).`
    );
    chargerLeads();
  }

  async function changerStatut(id: string, statut: string) {
    await fetch(`/api/super-admin/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statut }),
    });
    chargerLeads();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Prospection de leads</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Recherchez des commerces dans une zone geographique, envoyez-leur automatiquement
        un message de presentation d&apos;Avis Facile, et suivez leur conversion.
      </p>

      <form
        onSubmit={lancerRecherche}
        className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label className="block text-sm font-medium">Zone geographique</label>
          <input
            list="villes-suggestions"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            placeholder="Ville ou region (ex: Lyon)"
          />
          <datalist id="villes-suggestions">
            {VILLES_SUGGESTIONS.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-slate-400">
            Priorite initiale : grandes villes de Rhone-Alpes. Zone libre, aucun ordre impose.
          </p>
        </div>
        <button
          type="submit"
          disabled={recherche}
          className="rounded-lg bg-brand-500 px-6 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {recherche ? "Recherche..." : "Rechercher des leads"}
        </button>
      </form>

      {resultat && (
        <p className="mt-3 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">
          {resultat}
        </p>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Conformite RGPD : chaque message de prospection rappelle la possibilite de se
        desinscrire (STOP). Les leads marques &laquo;desinscrit&raquo; ne sont plus recontactes.
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3">Commerce</th>
              <th className="px-4 py-3">Ville</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Ajoute le</th>
              <th className="px-4 py-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{lead.nom}</td>
                <td className="px-4 py-3 text-slate-500">{lead.ville}</td>
                <td className="px-4 py-3 text-slate-500">
                  {lead.telephone || lead.email || "—"}
                  {lead.optOut && (
                    <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                      desinscrit
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(lead.ajouteLe).toLocaleDateString("fr-FR")}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={lead.statut}
                    onChange={(e) => changerStatut(lead.id, e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  >
                    {Object.entries(LIBELLES_STATUT).map(([valeur, libelle]) => (
                      <option key={valeur} value={valeur}>
                        {libelle}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Aucun lead pour l&apos;instant. Lancez une recherche ci-dessus.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
