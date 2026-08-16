import type { Timestamp } from "firebase/firestore";

export type OrderStatus = "waiting" | "preparing" | "ready" | "delivered";

export type OrderSource = "client" | "cashier";

export interface Order {
  id: string;
  number: number;
  status: OrderStatus;
  dayKey: string;
  source: OrderSource;
  fcmToken: string | null;
  createdAt: Timestamp | null;
  preparingAt: Timestamp | null;
  readyAt: Timestamp | null;
  deliveredAt: Timestamp | null;
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  waiting: "En attente",
  preparing: "En préparation",
  ready: "Prêt",
  delivered: "Délivrée",
};

/** Statut suivant dans le cycle de vie d'une commande, et libellé du
 * bouton d'action correspondant côté caisse. */
export const NEXT_STATUS: Record<
  Exclude<OrderStatus, "delivered">,
  { status: OrderStatus; actionLabel: string; timestampField: string }
> = {
  waiting: {
    status: "preparing",
    actionLabel: "Démarrer la préparation",
    timestampField: "preparingAt",
  },
  preparing: {
    status: "ready",
    actionLabel: "Marquer prêt",
    timestampField: "readyAt",
  },
  ready: {
    status: "delivered",
    actionLabel: "Délivrée",
    timestampField: "deliveredAt",
  },
};

export function getNextStatusInfo(status: OrderStatus) {
  if (status === "delivered") return undefined;
  return NEXT_STATUS[status];
}
