import { NextRequest, NextResponse } from "next/server";
import { envoyerDemandesAvisEnAttente } from "@/lib/tachesPlanifiees";

// Point d'entree destine a etre appele par un service de cron externe
// (Vercel Cron, GitHub Actions planifie, etc.) toutes les 5-15 minutes.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const enTete = request.headers.get("authorization");
    if (enTete !== `Bearer ${secret}`) {
      return NextResponse.json({ erreur: "Non autorise." }, { status: 401 });
    }
  }

  const resultat = await envoyerDemandesAvisEnAttente();
  return NextResponse.json(resultat);
}
