"use client";

import { useState } from "react";

export default function PageConnexionSuperAdmin() {
  const [motDePasse, setMotDePasse] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setChargement(true);
    setErreur(null);

    const res = await fetch("/api/super-admin/connexion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motDePasse }),
    });

    if (!res.ok) {
      const data = await res.json();
      setErreur(data.erreur || "Erreur de connexion.");
      setChargement(false);
      return;
    }

    window.location.href = "/super-admin";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-xl font-bold">Espace Super Admin</h1>
      <p className="mt-1 text-sm text-slate-500">
        Module de prospection — reserve a l&apos;operateur de la plateforme.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <input
          required
          type="password"
          placeholder="Mot de passe"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
        />
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        <button
          type="submit"
          disabled={chargement}
          className="w-full rounded-lg bg-slate-900 px-6 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {chargement ? "Connexion..." : "Entrer"}
        </button>
      </form>
    </main>
  );
}
