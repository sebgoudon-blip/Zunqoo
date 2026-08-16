import { useCallback, useEffect, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { createOrderCallable, db } from "../firebase";
import { useOrders } from "../hooks/useOrders";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useVendorId } from "../hooks/useVendorId";
import { VendorSetup } from "./VendorSetup";
import { STATUS_LABELS, getNextStatusInfo, type Order } from "../types";

const ACTIVE_STATUSES: Order["status"][] = ["waiting", "preparing", "ready"];

export function CashierPage() {
  const [vendorId, setVendorId] = useVendorId();

  if (!vendorId) {
    return <VendorSetup title="Configuration — Caisse" onSubmit={setVendorId} />;
  }

  return <CashierBoard vendorId={vendorId} />;
}

function CashierBoard({ vendorId }: { vendorId: string }) {
  const { orders, loading, error, hasPendingWrites } = useOrders(
    vendorId,
    ACTIVE_STATUSES
  );
  const online = useOnlineStatus();
  const [creating, setCreating] = useState(false);
  const [pendingCreation, setPendingCreation] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [lastCreatedNumber, setLastCreatedNumber] = useState<number | null>(null);

  const handleCreateOrder = useCallback(async () => {
    if (!online) {
      // Pas de connexion : on retentera automatiquement au retour du réseau.
      setPendingCreation(true);
      return;
    }
    setCreating(true);
    try {
      const result = await createOrderCallable({ vendorId, source: "cashier" });
      setLastCreatedNumber(result.data.number);
      setPendingCreation(false);
    } catch (err) {
      console.error("Échec de création de commande :", err);
      setPendingCreation(true);
    } finally {
      setCreating(false);
    }
  }, [online, vendorId]);

  // Retente automatiquement la création en attente dès que le réseau revient.
  useEffect(() => {
    if (online && pendingCreation && !creating) {
      handleCreateOrder();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  async function handleAdvance(order: Order) {
    const next = getNextStatusInfo(order.status);
    if (!next) return;
    setActioningId(order.id);
    try {
      await updateDoc(doc(db, "vendors", vendorId, "orders", order.id), {
        status: next.status,
        [next.timestampField]: serverTimestamp(),
      });
    } catch (err) {
      console.error("Échec de mise à jour du statut :", err);
    } finally {
      setActioningId(null);
    }
  }

  return (
    <div className="cashier-screen">
      <header className="cashier-header">
        <div>
          <h1>Caisse — {vendorId}</h1>
          <ConnectivityBadge online={online} syncing={hasPendingWrites || pendingCreation} />
        </div>
        <button
          className="btn btn-primary btn-huge"
          onClick={handleCreateOrder}
          disabled={creating}
        >
          {creating ? "Création…" : "+ Nouvelle commande"}
        </button>
      </header>

      {lastCreatedNumber !== null && (
        <div className="toast">Commande n°{lastCreatedNumber} créée.</div>
      )}
      {pendingCreation && (
        <div className="toast toast-warning">
          Hors ligne : la nouvelle commande sera créée dès le retour du réseau.
        </div>
      )}

      {error && <p className="error-text">Erreur : {error}</p>}
      {loading && <p>Chargement des commandes…</p>}

      {!loading && orders.length === 0 && (
        <p className="empty-state">Aucune commande en cours.</p>
      )}

      <ul className="order-list">
        {orders.map((order) => {
          const next = getNextStatusInfo(order.status);
          return (
            <li key={order.id} className={`order-row status-${order.status}`}>
              <span className="order-number">#{order.number}</span>
              <span className="order-status-badge">{STATUS_LABELS[order.status]}</span>
              {next && (
                <button
                  className="btn btn-secondary btn-large"
                  onClick={() => handleAdvance(order)}
                  disabled={actioningId === order.id}
                >
                  {next.actionLabel}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ConnectivityBadge({ online, syncing }: { online: boolean; syncing: boolean }) {
  if (!online) {
    return <span className="badge badge-offline">Hors ligne</span>;
  }
  if (syncing) {
    return <span className="badge badge-syncing">Synchronisation…</span>;
  }
  return <span className="badge badge-online">En ligne</span>;
}
