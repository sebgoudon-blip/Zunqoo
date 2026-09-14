// Envoi d'email via l'API REST Resend (pas de SDK pour rester leger).
// Si aucune cle n'est configuree, l'email est simule (log console).

type ResultatEnvoiEmail = {
  simule: boolean;
  id?: string;
  erreur?: string;
};

export async function envoyerEmail(
  destinataire: string,
  sujet: string,
  html: string
): Promise<ResultatEnvoiEmail> {
  const { RESEND_API_KEY, RESEND_FROM_EMAIL } = process.env;

  if (!RESEND_API_KEY) {
    console.log(`[EMAIL SIMULE] -> ${destinataire} | ${sujet}\n${html}`);
    return { simule: true };
  }

  try {
    const reponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL || "Avis Facile <contact@avisfacile.fr>",
        to: destinataire,
        subject: sujet,
        html,
      }),
    });

    const data = await reponse.json();

    if (!reponse.ok) {
      console.error("[EMAIL] Erreur Resend:", data);
      return { simule: false, erreur: data?.message || "Erreur envoi email" };
    }

    return { simule: false, id: data.id };
  } catch (err) {
    console.error("[EMAIL] Exception:", err);
    return { simule: false, erreur: "Exception lors de l'envoi de l'email" };
  }
}

export function emailProspectionHtml(nomCommerce: string, lienFunnel: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: auto;">
      <h2>Bonjour ${nomCommerce},</h2>
      <p>
        Saviez-vous que la plupart des commerces perdent des avis Google chaque semaine
        faute de suivi client&nbsp;?
      </p>
      <p>
        <strong>Avis Facile</strong> automatise la collecte du numero de telephone en caisse,
        l'envoi d'une demande d'avis, et recompense vos clients avec un code promo une fois
        l'avis laisse.
      </p>
      <p>
        <a href="${lienFunnel}" style="background:#1cb35e;color:#fff;padding:10px 18px;
        border-radius:6px;text-decoration:none;">Decouvrir Avis Facile</a>
      </p>
      <hr />
      <p style="font-size:12px;color:#666;">
        Vous recevez cet email car votre commerce a ete identifie via une source publique
        (annuaire professionnel / Google Places) dans le cadre d'une action de prospection commerciale B2B.
        Conformement au RGPD, vous pouvez vous desinscrire a tout moment en repondant "STOP" a cet email.
      </p>
    </div>
  `;
}
