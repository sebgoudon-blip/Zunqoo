"use client";

import { useEffect, useState } from "react";

export default function PageParametres() {
  const [lienAvisGoogle, setLienAvisGoogle] = useState("");
  const [delaiEnvoiHeures, setDelaiEnvoiHeures] = useState(3);
  const [telephone, setTelephone] = useState("");
  const [chargement, setChargement] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/commercant")
      .then((r) => r.json())
      .then((data) => {
        if (data.commercant) {
          setLienAvisGoogle(data.commercant.lienAvisGoogle || "");
          setDelaiEnvoiHeures(data.commercant.delaiEnvoiHeures);
          setTelephone(data.commercant.telephone || "");
        }
      });
  }, []);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setChargement(true);
    setMessage(null);

    const res = await fetch("/api/commercant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lienAvisGoogle, delaiEnvoiHeures, telephone }),
    });

    setChargement(false);
    setMessage(res.ok ? "Parametres enregistres." : "Erreur lors de l'enregistrement.");
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold">Parametres</h1>

      <form onSubmit={enregistrer} className="mt-6 space-y-5">
        <div>
          <label className="block text-sm font-medium">
            Lien vers votre fiche avis Google
          </label>
          <input
            placeholder="https://g.page/r/..."
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={lienAvisGoogle}
            onChange={(e) => setLienAvisGoogle(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400">
            C&apos;est ce lien qui sera envoye par SMS a vos clients.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium">
            Delai avant l&apos;envoi du SMS (en heures)
          </label>
          <input
            type="number"
            min={0}
            className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2"
            value={delaiEnvoiHeures}
            onChange={(e) => setDelaiEnvoiHeures(Number(e.target.value))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Telephone du commerce</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
          />
        </div>

        {message && <p className="text-sm text-brand-600">{message}</p>}

        <button
          type="submit"
          disabled={chargement}
          className="rounded-lg bg-brand-500 px-6 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {chargement ? "Enregistrement..." : "Enregistrer"}
        </button>
      </form>
    </div>
  );
}
