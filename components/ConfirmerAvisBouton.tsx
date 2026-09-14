"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ConfirmerAvisBouton({ token }: { token: string }) {
  const router = useRouter();
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function confirmer() {
    setChargement(true);
    setErreur(null);

    try {
      const res = await fetch("/api/avis/confirmer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErreur(data.erreur || "Une erreur est survenue.");
        setChargement(false);
        return;
      }

      router.push(`/merci/${data.code}`);
    } catch {
      setErreur("Impossible de contacter le serveur.");
      setChargement(false);
    }
  }

  return (
    <div>
      <button
        onClick={confirmer}
        disabled={chargement}
        className="w-full rounded-lg bg-brand-500 px-6 py-3 font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
      >
        {chargement ? "Verification..." : "J'ai laisse mon avis"}
      </button>
      {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}
    </div>
  );
}
