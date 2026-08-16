import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "../theme";
import { subscribeToOrder } from "../orders";
import { clearActiveOrder } from "../storage";
import { STATUS_LABELS, STATUS_STEP_INDEX, type Order, type OrderStatus } from "../types";

interface Props {
  vendorId: string;
  orderId: string;
  initialNumber: number;
  onDone: () => void;
}

const STEPS: OrderStatus[] = ["waiting", "preparing", "ready"];

export function OrderStatusScreen({ vendorId, orderId, initialNumber, onDone }: Props) {
  const [order, setOrder] = useState<Order | null>(null);
  const [waitingForSync, setWaitingForSync] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const hasSyncedOnceRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeToOrder(
      vendorId,
      orderId,
      (nextOrder, { fromCache }) => {
        if (!fromCache) hasSyncedOnceRef.current = true;
        setWaitingForSync(fromCache && !hasSyncedOnceRef.current);
        if (nextOrder) {
          setOrder(nextOrder);
          setNotFound(false);
        } else if (!fromCache) {
          setNotFound(true);
        }
      },
      (err) => {
        console.warn("Erreur de suivi de la commande :", err);
        setWaitingForSync(true);
      }
    );
    return unsubscribe;
  }, [vendorId, orderId]);

  useEffect(() => {
    if (order?.status === "delivered") {
      clearActiveOrder();
    }
  }, [order?.status]);

  const status = order?.status ?? "waiting";
  const number = order?.number ?? initialNumber;

  if (notFound) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Commande introuvable</Text>
        <Text style={styles.subtitle}>
          Cette commande n'existe plus. Elle a peut-être déjà été délivrée
          lors d'une session précédente.
        </Text>
        <TouchableOpacity style={styles.homeButton} onPress={onDone}>
          <Text style={styles.homeButtonText}>Retour à l'accueil</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === "delivered") {
    return (
      <View style={styles.container}>
        <Text style={styles.bigNumber}>#{number}</Text>
        <Text style={styles.title}>Bon appétit !</Text>
        <TouchableOpacity style={styles.homeButton} onPress={onDone}>
          <Text style={styles.homeButtonText}>Retour à l'accueil</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {waitingForSync && (
        <View style={styles.syncBanner}>
          <ActivityIndicator size="small" color={theme.colors.warning} />
          <Text style={styles.syncBannerText}>En attente de synchronisation…</Text>
        </View>
      )}

      <Text style={styles.numberLabel}>Votre numéro</Text>
      <Text style={[styles.bigNumber, status === "ready" && styles.bigNumberReady]}>
        #{number}
      </Text>

      <View style={styles.stepper}>
        {STEPS.map((step) => {
          const reached = STATUS_STEP_INDEX[status] >= STATUS_STEP_INDEX[step];
          return (
            <View key={step} style={styles.step}>
              <View style={[styles.stepDot, reached && styles.stepDotActive]} />
              <Text style={[styles.stepLabel, reached && styles.stepLabelActive]}>
                {STATUS_LABELS[step]}
              </Text>
            </View>
          );
        })}
      </View>

      {status === "ready" && (
        <Text style={styles.readyMessage}>
          Votre commande est prête, venez la récupérer au comptoir !
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing(4),
  },
  syncBanner: {
    position: "absolute",
    top: theme.spacing(6),
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fbecd2",
    paddingVertical: theme.spacing(1),
    paddingHorizontal: theme.spacing(2),
    borderRadius: 999,
    gap: theme.spacing(1),
  },
  syncBannerText: { color: theme.colors.warning, fontWeight: "600" },
  numberLabel: {
    fontSize: 18,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing(1),
  },
  bigNumber: {
    fontSize: 96,
    fontWeight: "900",
    color: theme.colors.text,
  },
  bigNumberReady: {
    color: theme.colors.ready,
  },
  title: { fontSize: 26, fontWeight: "800", color: theme.colors.text, marginTop: theme.spacing(2) },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginTop: theme.spacing(2),
  },
  stepper: {
    flexDirection: "row",
    marginTop: theme.spacing(5),
    gap: theme.spacing(3),
  },
  step: { alignItems: "center", gap: theme.spacing(1) },
  stepDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.border,
  },
  stepDotActive: { backgroundColor: theme.colors.primary },
  stepLabel: { fontSize: 13, color: theme.colors.textMuted },
  stepLabelActive: { color: theme.colors.text, fontWeight: "700" },
  readyMessage: {
    marginTop: theme.spacing(4),
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.ready,
    textAlign: "center",
  },
  homeButton: {
    marginTop: theme.spacing(4),
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing(2),
    paddingHorizontal: theme.spacing(4),
    borderRadius: theme.radius,
  },
  homeButtonText: { color: "white", fontSize: 17, fontWeight: "700" },
});
