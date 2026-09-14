"use client";

import { useEffect, useState } from "react";

function calculerRestant(cible: number) {
  const diff = Math.max(0, cible - Date.now());
  const jours = Math.floor(diff / (1000 * 60 * 60 * 24));
  const heures = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const secondes = Math.floor((diff / 1000) % 60);
  return { jours, heures, minutes, secondes };
}

// Compte a rebours d'urgence pour l'offre de lancement (7 jours glissants).
export default function CompteARebours() {
  const [cible] = useState(() => Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [restant, setRestant] = useState(() => calculerRestant(cible));

  useEffect(() => {
    const intervalle = setInterval(() => {
      setRestant(calculerRestant(cible));
    }, 1000);
    return () => clearInterval(intervalle);
  }, [cible]);

  const unite = (valeur: number, label: string) => (
    <div className="flex flex-col items-center">
      <span className="text-2xl font-bold tabular-nums">
        {valeur.toString().padStart(2, "0")}
      </span>
      <span className="text-xs uppercase tracking-wide text-brand-100">{label}</span>
    </div>
  );

  return (
    <div className="flex items-center justify-center gap-4 rounded-lg bg-brand-700/40 px-6 py-4">
      {unite(restant.jours, "jours")}
      <span className="text-2xl font-bold text-brand-100">:</span>
      {unite(restant.heures, "heures")}
      <span className="text-2xl font-bold text-brand-100">:</span>
      {unite(restant.minutes, "min")}
      <span className="text-2xl font-bold text-brand-100">:</span>
      {unite(restant.secondes, "sec")}
    </div>
  );
}
