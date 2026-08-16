import { doc, onSnapshot } from "firebase/firestore";
import { createOrderCallable, db } from "./firebase";
import type { Order } from "./types";

export async function createClientOrder(
  vendorId: string,
  fcmToken: string | null
): Promise<{ orderId: string; number: number }> {
  const result = await createOrderCallable({
    vendorId,
    source: "client",
    fcmToken,
  });
  return result.data;
}

export function subscribeToOrder(
  vendorId: string,
  orderId: string,
  onChange: (order: Order | null, opts: { fromCache: boolean }) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(
    doc(db, "vendors", vendorId, "orders", orderId),
    { includeMetadataChanges: true },
    (snap) => {
      if (!snap.exists()) {
        onChange(null, { fromCache: snap.metadata.fromCache });
        return;
      }
      onChange(
        { id: snap.id, vendorId, ...(snap.data() as Omit<Order, "id" | "vendorId">) },
        { fromCache: snap.metadata.fromCache }
      );
    },
    onError
  );
}
