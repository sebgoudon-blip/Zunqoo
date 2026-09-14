import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estSuperAdminConnecte } from "@/lib/session";
import { rechercherLeads } from "@/lib/leads";
import { envoyerSms, messageProspectionSms } from "@/lib/sms";
import { envoyerEmail, emailProspectionHtml } from "@/lib/email";

// Prospection commerciale B2B (commercants), pas des consommateurs finaux :
// le RGPD encadre neanmoins ces envois (interet legitime, opt-out obligatoire).
// Chaque message envoye rappelle la possibilite de se desinscrire ("STOP").
export async function POST(request: NextRequest) {
  if (!estSuperAdminConnecte()) {
    return NextResponse.json({ erreur: "Non autorise." }, { status: 401 });
  }

  const { zone } = (await request.json()) as { zone?: string };
  if (!zone || zone.trim().length === 0) {
    return NextResponse.json({ erreur: "Zone geographique requise." }, { status: 400 });
  }

  const appUrl = process.env.APP_URL || request.nextUrl.origin;
  const leadsTrouves = await rechercherLeads(zone.trim());

  let nouveaux = 0;
  let doublons = 0;
  let messagesEnvoyes = 0;

  for (const lead of leadsTrouves) {
    const existant = await prisma.lead.findFirst({
      where: { nom: lead.nom, ville: lead.ville, telephone: lead.telephone },
    });

    if (existant) {
      doublons++;
      continue;
    }

    const nouveauLead = await prisma.lead.create({
      data: {
        nom: lead.nom,
        telephone: lead.telephone,
        email: lead.email,
        adresse: lead.adresse,
        ville: lead.ville,
        source: lead.source,
      },
    });
    nouveaux++;

    if (nouveauLead.optOut) continue;

    let contacte = false;

    if (nouveauLead.telephone) {
      await envoyerSms(
        nouveauLead.telephone,
        messageProspectionSms(nouveauLead.nom, `${appUrl}/`)
      );
      contacte = true;
    }

    if (nouveauLead.email) {
      await envoyerEmail(
        nouveauLead.email,
        "Ne perdez plus vos avis Google",
        emailProspectionHtml(nouveauLead.nom, `${appUrl}/`)
      );
      contacte = true;
    }

    if (contacte) {
      messagesEnvoyes++;
      await prisma.lead.update({
        where: { id: nouveauLead.id },
        data: { statut: "contacte", contacteLe: new Date() },
      });
    }
  }

  return NextResponse.json({
    totalTrouves: leadsTrouves.length,
    nouveaux,
    doublons,
    messagesEnvoyes,
  });
}
