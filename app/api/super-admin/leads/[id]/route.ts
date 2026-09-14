import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estSuperAdminConnecte } from "@/lib/session";

const STATUTS_VALIDES = ["nouveau", "contacte", "interesse", "converti", "refuse"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!estSuperAdminConnecte()) {
    return NextResponse.json({ erreur: "Non autorise." }, { status: 401 });
  }

  const { statut, notes, optOut } = (await request.json()) as {
    statut?: string;
    notes?: string;
    optOut?: boolean;
  };

  if (statut && !STATUTS_VALIDES.includes(statut)) {
    return NextResponse.json({ erreur: "Statut invalide." }, { status: 400 });
  }

  const lead = await prisma.lead.update({
    where: { id: params.id },
    data: {
      ...(statut ? { statut } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(optOut !== undefined ? { optOut } : {}),
    },
  });

  return NextResponse.json({ lead });
}
