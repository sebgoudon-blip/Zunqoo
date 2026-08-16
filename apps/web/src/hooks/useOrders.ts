import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { todayDayKey } from "../date";
import type { Order, OrderStatus } from "../types";

interface UseOrdersResult {
  orders: Order[];
  loading: boolean;
  error: string | null;
  /** true tant que des écritures locales n'ont pas encore été confirmées
   * par le serveur (utile pour l'indicateur "en attente de synchronisation"). */
  hasPendingWrites: boolean;
}

export function useOrders(
  vendorId: string,
  statuses: OrderStatus[]
): UseOrdersResult {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasPendingWrites, setHasPendingWrites] = useState(false);

  const statusesKey = statuses.join(",");

  useEffect(() => {
    if (!vendorId || statuses.length === 0) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "vendors", vendorId, "orders"),
      where("dayKey", "==", todayDayKey()),
      where("status", "in", statuses),
      orderBy("number", "asc")
    );

    setLoading(true);
    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        const next: Order[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Order, "id">),
        }));
        setOrders(next);
        setHasPendingWrites(snapshot.docs.some((d) => d.metadata.hasPendingWrites));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Erreur d'écoute des commandes :", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, statusesKey]);

  return { orders, loading, error, hasPendingWrites };
}
