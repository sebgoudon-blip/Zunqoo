"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function PageInscription() {
  const router = useRouter();
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [form, setForm] = useState({
    nom: "",
    email: "",
    motDePasse: "",
    telephone: "",
    lienAvisGoogle: "",
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setChargement(true);
    setErreur(null);

    try {
      const res = await fetch("/api/auth/inscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, plan: "lancement" }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErreur(data.erreur || "Une erreur est survenue.");
        setChargement(false);
        return;
      }

      window.location.href = data.redirection || "/dashboard";
    } catch {
      setErreur("Impossible de contacter le serveur.");
      setChargement(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-bold">Creer votre compte Avis Facile</h1>
      <p className="mt-2 text-sm text-slate-600">
        Offre de lancement : 19€/mois pendant 3 mois.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label className="block text-sm font-medium">Nom du commerce</label>
          <input
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.nom}
            onChange={(e) => setForm({ ...form, nom: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            required
            type="email"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Mot de passe</label>
          <input
            required
            type="password"
            minLength={8}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.motDePasse}
            onChange={(e) => setForm({ ...form, motDePasse: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Telephone du commerce (optionnel)</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.telephone}
            onChange={(e) => setForm({ ...form, telephone: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">
            Lien vers votre fiche avis Google (optionnel, modifiable plus tard)
          </label>
          <input
            placeholder="https://g.page/r/..."
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.lienAvisGoogle}
            onChange={(e) => setForm({ ...form, lienAvisGoogle: e.target.value })}
          />
        </div>

        {erreur && <p className="text-sm text-red-600">{erreur}</p>}

        <button
          type="submit"
          disabled={chargement}
          className="w-full rounded-lg bg-brand-500 px-6 py-3 font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
        >
          {chargement ? "Creation..." : "Creer mon compte"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Deja inscrit ?{" "}
        <Link href="/connexion" className="text-brand-600 underline">
          Connectez-vous
        </Link>
      </p>
    </main>
  );
}
