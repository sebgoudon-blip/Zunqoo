import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCommercantConnecte } from "@/lib/session";

export async function GET() {
  const commercant = await getCommercantConnecte();
  if (!commercant) {
    return NextResponse.json({ erreur: "Non authentifie." }, { status: 401 });
  }
  return NextResponse.json({ commercant });
}

export async function PATCH(request: NextRequest) {
  const commercant = await getCommercantConnecte();
  if (!commercant) {
    return NextResponse.json({ erreur: "Non authentifie." }, { status: 401 });
  }

  const { lienAvisGoogle, delaiEnvoiHeures, telephone } = (await request.json()) as {
    lienAvisGoogle?: string;
    delaiEnvoiHeures?: number;
    telephone?: string;
  };

  const misAJour = await prisma.commercant.update({
    where: { id: commercant.id },
    data: {
      lienAvisGoogle: lienAvisGoogle ?? commercant.lienAvisGoogle,
      delaiEnvoiHeures:
        typeof delaiEnvoiHeures === "number" && delaiEnvoiHeures >= 0
          ? delaiEnvoiHeures
          : commercant.delaiEnvoiHeures,
      telephone: telephone ?? commercant.telephone,
    },
  });

  return NextResponse.json({ commercant: misAJour });
}
