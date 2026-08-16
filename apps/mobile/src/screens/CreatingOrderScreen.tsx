import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "../theme";
import { registerForPushNotifications } from "../notifications";
import { createClientOrder } from "../orders";

interface Props {
  vendorId: string;
  onCreated: (result: { orderId: string; number: number }) => void;
  onCancel: () => void;
}

const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000, 30000];

/**
 * Crée la commande côté serveur après le scan. Sur un réseau de festival
 * dégradé, cet appel peut échouer transitoirement : on retente
 * automatiquement avec un backoff croissant plutôt que d'afficher une
 * erreur bloquante, en affichant un état "en attente de synchronisation".
 */
export function CreatingOrderScreen({ vendorId, onCreated, onCancel }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [waitingForSync, setWaitingForSync] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    async function attemptCreate() {
      try {
        const fcmToken = await registerForPushNotifications();
        const result = await createClientOrder(vendorId, fcmToken);
        if (!cancelledRef.current) {
          onCreated(result);
        }
      } catch (err) {
        console.warn("Création de commande échouée, nouvelle tentative…", err);
        if (cancelledRef.current) return;
        setWaitingForSync(true);
        const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
        timeoutId = setTimeout(() => {
          if (!cancelledRef.current) setAttempt((a) => a + 1);
        }, delay);
      }
    }

    attemptCreate();

    return () => {
      cancelledRef.current = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, vendorId]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={theme.colors.primary} size="large" />
      <Text style={styles.title}>
        {waitingForSync ? "En attente de synchronisation…" : "Attribution de votre numéro…"}
      </Text>
      {waitingForSync && (
        <Text style={styles.subtitle}>
          Réseau instable — nouvelle tentative automatique en cours.
        </Text>
      )}
      <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
        <Text style={styles.cancelButtonText}>Annuler</Text>
      </TouchableOpacity>
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
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: theme.spacing(3),
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: theme.colors.warning,
    marginTop: theme.spacing(1),
    textAlign: "center",
  },
  cancelButton: { marginTop: theme.spacing(4), padding: theme.spacing(2) },
  cancelButtonText: {
    color: theme.colors.textMuted,
    fontSize: 16,
    textDecorationLine: "underline",
  },
});
