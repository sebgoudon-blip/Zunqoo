import { prisma } from "@/lib/prisma";
import { getCommercantConnecte } from "@/lib/session";

export default async function PageTableauDeBord() {
  const commercant = await getCommercantConnecte();
  if (!commercant) return null;

  const [totalClients, avisConfirmes, codesUtilises] = await Promise.all([
    prisma.clientFinal.count({ where: { commercantId: commercant.id } }),
    prisma.clientFinal.count({
      where: { commercantId: commercant.id, avisConfirmeLe: { not: null } },
    }),
    prisma.promoCode.count({
      where: { commercantId: commercant.id, utilise: true },
    }),
  ]);

  const tauxConversion =
    totalClients > 0 ? Math.round((avisConfirmes / totalClients) * 100) : 0;

  const carte = (titre: string, valeur: string | number, sousTitre?: string) => (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-500">{titre}</p>
      <p className="mt-2 text-3xl font-bold">{valeur}</p>
      {sousTitre && <p className="mt-1 text-xs text-slate-400">{sousTitre}</p>}
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold">Tableau de bord</h1>
      <p className="mt-1 text-sm text-slate-500">
        Abonnement : <span className="font-medium">{commercant.statutAbonnement}</span> —
        plan {commercant.plan}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {carte("Clients enregistres", totalClients)}
        {carte("Avis confirmes", avisConfirmes)}
        {carte("Taux de conversion", `${tauxConversion}%`)}
        {carte("Codes promo utilises", codesUtilises)}
      </div>

      {!commercant.lienAvisGoogle && (
        <div className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Pensez a renseigner le lien vers votre fiche avis Google dans les{" "}
          <a href="/dashboard/parametres" className="underline">
            parametres
          </a>{" "}
          pour que les SMS fonctionnent.
        </div>
      )}
    </div>
  );
}
