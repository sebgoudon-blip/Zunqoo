// Envoi de SMS via l'API REST Twilio (pas de SDK pour rester leger).
// Si aucune cle Twilio n'est configuree, le SMS est simule (log console) :
// pratique pour developper/demo sans compte Twilio.

type ResultatEnvoiSms = {
  simule: boolean;
  sid?: string;
  erreur?: string;
};

export async function envoyerSms(
  destinataire: string,
  message: string
): Promise<ResultatEnvoiSms> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    console.log(`[SMS SIMULE] -> ${destinataire}: ${message}`);
    return { simule: true };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString(
      "base64"
    );

    const body = new URLSearchParams({
      To: destinataire,
      From: TWILIO_FROM_NUMBER,
      Body: message,
    });

    const reponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const data = await reponse.json();

    if (!reponse.ok) {
      console.error("[SMS] Erreur Twilio:", data);
      return { simule: false, erreur: data?.message || "Erreur envoi SMS" };
    }

    return { simule: false, sid: data.sid };
  } catch (err) {
    console.error("[SMS] Exception:", err);
    return { simule: false, erreur: "Exception lors de l'envoi du SMS" };
  }
}

export function messageDemandeAvis(lienAvis: string, lienConfirmation: string): string {
  return (
    `Merci pour votre visite ! Laissez-nous un avis Google en 30 secondes : ${lienAvis}\n` +
    `Une fois fait, confirmez ici pour recevoir votre code promo : ${lienConfirmation}`
  );
}

export function messageConfirmationPromo(code: string, pourcentage: number): string {
  return (
    `Merci pour votre avis ! Voici votre code promo : ${code} ` +
    `(${pourcentage}% de reduction lors de votre prochain passage). A bientot !`
  );
}

export function messageProspectionSms(nomCommerce: string, lienFunnel: string): string {
  return (
    `Bonjour ${nomCommerce}, decouvrez Avis Facile, l'outil qui automatise la collecte ` +
    `de vos avis Google : ${lienFunnel}\nRepondez STOP pour ne plus recevoir de message.`
  );
}
