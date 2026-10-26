import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { OrderSource, todayDayKey } from "./orderStatus";

initializeApp();
const db = getFirestore();

const REGION = "europe-west1";

interface CreateOrderRequest {
  vendorId: string;
  source: OrderSource;
  fcmToken?: string | null;
}

/**
 * Crée une nouvelle commande pour un vendeur : attribue de façon atomique
 * le prochain numéro de la journée (le compteur ne redémarre jamais dans
 * la même journée et ne recule jamais), puis crée le document de commande.
 *
 * Appelée à la fois par l'app cliente (après scan du QR code) et par
 * l'interface caisse (bouton "Nouvelle commande").
 */
export const createOrder = onCall(
  { region: REGION },
  async (request) => {
    const data = request.data as CreateOrderRequest;
    const vendorId = (data?.vendorId ?? "").trim();
    const source = data?.source;
    const fcmToken = data?.fcmToken?.trim() || null;

    if (!vendorId) {
      throw new HttpsError("invalid-argument", "vendorId est requis.");
    }
    if (source !== "client" && source !== "cashier") {
      throw new HttpsError(
        "invalid-argument",
        "source doit être 'client' ou 'cashier'."
      );
    }

    const vendorRef = db.collection("vendors").doc(vendorId);
    const vendorSnap = await vendorRef.get();
    if (!vendorSnap.exists) {
      throw new HttpsError("not-found", "Vendeur inconnu.");
    }

    const dayKey = todayDayKey();
    const sessionRef = vendorRef.collection("sessions").doc(dayKey);
    const orderRef = vendorRef.collection("orders").doc();

    const number = await db.runTransaction(async (tx) => {
      const sessionSnap = await tx.get(sessionRef);
      const currentCounter = sessionSnap.exists
        ? (sessionSnap.data()?.counter as number) ?? 0
        : 0;
      const nextNumber = currentCounter + 1;

      tx.set(
        sessionRef,
        { counter: nextNumber, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );

      tx.set(orderRef, {
        number: nextNumber,
        status: "waiting",
        dayKey,
        source,
        fcmToken,
        createdAt: FieldValue.serverTimestamp(),
        preparingAt: null,
        readyAt: null,
        deliveredAt: null,
      });

      return nextNumber;
    });

    return { orderId: orderRef.id, number };
  }
);

/**
 * Déclenche la notification push dès qu'une commande passe au statut
 * "ready". S'appuie sur le token FCM enregistré à la création de la
 * commande (uniquement présent pour les commandes créées depuis l'app
 * cliente, qui a accepté les notifications).
 */
export const sendReadyNotification = onDocumentUpdated(
  { region: REGION, document: "vendors/{vendorId}/orders/{orderId}" },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.status === after.status) return;
    if (after.status !== "ready") return;
    if (!after.fcmToken) return;

    try {
      await getMessaging().send({
        token: after.fcmToken,
        notification: {
          title: "Votre commande est prête !",
          body: `Commande n°${after.number} — venez la récupérer au comptoir.`,
        },
        data: {
          orderId: event.params.orderId,
          vendorId: event.params.vendorId,
          number: String(after.number),
        },
        android: { priority: "high" },
        apns: { headers: { "apns-priority": "10" } },
      });
    } catch (err) {
      logger.error("Échec de l'envoi de la notification push FCM", err);
    }
  }
);

// HighTicket Pilot (apps/high-ticket) : assistant IA et connexion Shopify.
// Volontairement NON exporté tant que le lancement n'est pas validé : ces
// fonctions ne sont donc jamais déployées, même lors d'un
// `firebase deploy --only functions` fait pour Zunqoo. Pour lancer,
// décommenter la ligne suivante (voir apps/high-ticket/README.md).
// export * from "./highTicket";
