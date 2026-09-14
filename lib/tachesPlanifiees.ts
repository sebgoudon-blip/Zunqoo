import { prisma } from "@/lib/prisma";
import { envoyerSms, messageDemandeAvis } from "@/lib/sms";

// Envoie le SMS de demande d'avis a tous les clients dont le delai configure
// par le commercant est ecoule et qui n'ont pas encore recu leur SMS.
export async function envoyerDemandesAvisEnAttente() {
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  const clientsEnAttente = await prisma.clientFinal.findMany({
    where: {
      smsEnvoyeLe: null,
      envoyerApres: { lte: new Date() },
    },
    include: { commercant: true },
  });

  let envoyes = 0;
  let ignores = 0;

  for (const client of clientsEnAttente) {
    if (!client.commercant.lienAvisGoogle) {
      // Pas de lien avis configure : on ne peut pas envoyer de demande utile.
      ignores++;
      continue;
    }

    const lienConfirmation = `${appUrl}/avis/${client.token}`;
    const message = messageDemandeAvis(client.commercant.lienAvisGoogle, lienConfirmation);

    await envoyerSms(client.telephone, message);

    await prisma.clientFinal.update({
      where: { id: client.id },
      data: { smsEnvoyeLe: new Date() },
    });

    envoyes++;
  }

  return { envoyes, ignores, total: clientsEnAttente.length };
}
