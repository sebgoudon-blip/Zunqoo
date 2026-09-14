import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { genererCodePromo } from "@/lib/promo";
import { envoyerSms, messageConfirmationPromo } from "@/lib/sms";

const POURCENTAGE_PAR_DEFAUT = 10;

export async function POST(request: NextRequest) {
  const { token } = (await request.json()) as { token?: string };

  if (!token) {
    return NextResponse.json({ erreur: "Jeton manquant." }, { status: 400 });
  }

  const client = await prisma.clientFinal.findUnique({
    where: { token },
    include: { codePromo: true, commercant: true },
  });

  if (!client) {
    return NextResponse.json({ erreur: "Lien invalide ou expire." }, { status: 404 });
  }

  // Deja confirme : on renvoie simplement le code existant (idempotent).
  if (client.codePromo) {
    return NextResponse.json({
      code: client.codePromo.code,
      pourcentage: client.codePromo.pourcentage,
    });
  }

  const code = genererCodePromo();

  const [, promo] = await prisma.$transaction([
    prisma.clientFinal.update({
      where: { id: client.id },
      data: { avisConfirmeLe: new Date() },
    }),
    prisma.promoCode.create({
      data: {
        code,
        pourcentage: POURCENTAGE_PAR_DEFAUT,
        commercantId: client.commercantId,
        clientFinalId: client.id,
      },
    }),
  ]);

  await envoyerSms(
    client.telephone,
    messageConfirmationPromo(promo.code, promo.pourcentage)
  );

  return NextResponse.json({ code: promo.code, pourcentage: promo.pourcentage });
}
