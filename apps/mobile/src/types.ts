import type { Timestamp } from "firebase/firestore";

export type OrderStatus = "waiting" | "preparing" | "ready" | "delivered";

export interface Order {
  id: string;
  vendorId: string;
  number: number;
  status: OrderStatus;
  dayKey: string;
  createdAt: Timestamp | null;
  readyAt: Timestamp | null;
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  waiting: "En attente",
  preparing: "En préparation",
  ready: "Prêt !",
  delivered: "Délivrée",
};

export const STATUS_STEP_INDEX: Record<OrderStatus, number> = {
  waiting: 0,
  preparing: 1,
  ready: 2,
  delivered: 3,
};
