import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCommercantConnecte } from "@/lib/session";

export async function GET() {
  const commercant = await getCommercantConnecte();
  if (!commercant) {
    return NextResponse.json({ erreur: "Non authentifie." }, { status: 401 });
  }

  const clients = await prisma.clientFinal.findMany({
    where: { commercantId: commercant.id },
    orderBy: { creeLe: "desc" },
    include: { codePromo: true },
  });

  return NextResponse.json({ clients });
}

export async function POST(request: NextRequest) {
  const commercant = await getCommercantConnecte();
  if (!commercant) {
    return NextResponse.json({ erreur: "Non authentifie." }, { status: 401 });
  }

  const { telephone } = (await request.json()) as { telephone?: string };
  if (!telephone || telephone.trim().length < 6) {
    return NextResponse.json({ erreur: "Numero de telephone invalide." }, { status: 400 });
  }

  const envoyerApres = new Date(
    Date.now() + commercant.delaiEnvoiHeures * 60 * 60 * 1000
  );

  const client = await prisma.clientFinal.create({
    data: {
      commercantId: commercant.id,
      telephone: telephone.trim(),
      envoyerApres,
    },
  });

  return NextResponse.json({ client });
}
