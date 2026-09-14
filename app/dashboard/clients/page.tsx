"use client";

import { useEffect, useState } from "react";

type Client = {
  id: string;
  telephone: string;
  creeLe: string;
  envoyerApres: string;
  smsEnvoyeLe: string | null;
  avisConfirmeLe: string | null;
  codePromo: { code: string; utilise: boolean } | null;
};

function statutClient(c: Client): string {
  if (c.avisConfirmeLe) return "Avis confirme";
  if (c.smsEnvoyeLe) return "SMS envoye, en attente d'avis";
  return "En attente d'envoi";
}

export default function PageClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [telephone, setTelephone] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function chargerClients() {
    const res = await fetch("/api/clients");
    const data = await res.json();
    if (res.ok) setClients(data.clients);
  }

  useEffect(() => {
    chargerClients();
  }, []);

  async function ajouterClient(e: React.FormEvent) {
    e.preventDefault();
    setChargement(true);
    setErreur(null);

    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telephone }),
    });
    const data = await res.json();

    if (!res.ok) {
      setErreur(data.erreur || "Erreur lors de l'ajout.");
      setChargement(false);
      return;
    }

    setTelephone("");
    setChargement(false);
    chargerClients();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Clients</h1>
      <p className="mt-1 text-sm text-slate-500">
        Ajoutez le numero d&apos;un client juste apres son passage en caisse. La demande
        d&apos;avis partira automatiquement selon le delai configure dans les parametres.
      </p>

      <form onSubmit={ajouterClient} className="mt-6 flex max-w-md gap-2">
        <input
          required
          placeholder="+33 6 12 34 56 78"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
        />
        <button
          type="submit"
          disabled={chargement}
          className="rounded-lg bg-brand-500 px-5 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          Ajouter
        </button>
      </form>
      {erreur && <p className="mt-2 text-sm text-red-600">{erreur}</p>}

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3">Telephone</th>
              <th className="px-4 py-3">Ajoute le</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Code promo</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{c.telephone}</td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(c.creeLe).toLocaleString("fr-FR")}
                </td>
                <td className="px-4 py-3">{statutClient(c)}</td>
                <td className="px-4 py-3 font-mono">
                  {c.codePromo ? c.codePromo.code : "—"}
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Aucun client pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
