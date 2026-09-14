"use client";

import { useState } from "react";

export default function PageFacturation() {
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ouvrirPortail() {
    setChargement(true);
    setErreur(null);

    const res = await fetch("/api/stripe/portail", { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      setErreur(
        data.erreur ||
          "La facturation Stripe n'est pas encore configuree pour ce compte."
      );
      setChargement(false);
      return;
    }

    window.location.href = data.url;
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold">Facturation</h1>
      <p className="mt-2 text-sm text-slate-500">
        Gerez votre moyen de paiement, consultez vos factures ou changez de formule
        depuis le portail Stripe.
      </p>

      <button
        onClick={ouvrirPortail}
        disabled={chargement}
        className="mt-6 rounded-lg bg-brand-500 px-6 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {chargement ? "Ouverture..." : "Gerer mon abonnement"}
      </button>

      {erreur && <p className="mt-3 text-sm text-amber-700">{erreur}</p>}
    </div>
  );
}
