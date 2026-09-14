import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estSuperAdminConnecte } from "@/lib/session";

export async function GET() {
  if (!estSuperAdminConnecte()) {
    return NextResponse.json({ erreur: "Non autorise." }, { status: 401 });
  }

  const leads = await prisma.lead.findMany({ orderBy: { ajouteLe: "desc" } });
  return NextResponse.json({ leads });
}
