import { useOrders } from "../hooks/useOrders";
import { useVendorId } from "../hooks/useVendorId";
import { VendorSetup } from "./VendorSetup";

export function DisplayPage() {
  const [vendorId, setVendorId] = useVendorId();

  if (!vendorId) {
    return <VendorSetup title="Configuration — Écran d'affichage" onSubmit={setVendorId} />;
  }

  return <DisplayBoard vendorId={vendorId} />;
}

function DisplayBoard({ vendorId }: { vendorId: string }) {
  const { orders } = useOrders(vendorId, ["ready"]);

  return (
    <div className="display-screen">
      <h1 className="display-title">Commandes prêtes</h1>

      {orders.length === 0 ? (
        <p className="display-empty">
          Aucune commande prête pour le moment — préparation en cours.
        </p>
      ) : (
        <div className="display-grid">
          {orders.map((order) => (
            <div key={order.id} className="display-number">
              {order.number}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
