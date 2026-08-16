import { useEffect, useState } from "react";
import { SafeAreaView, StatusBar, StyleSheet } from "react-native";
import { HomeScreen } from "./src/screens/HomeScreen";
import { ScanScreen } from "./src/screens/ScanScreen";
import { CreatingOrderScreen } from "./src/screens/CreatingOrderScreen";
import { OrderStatusScreen } from "./src/screens/OrderStatusScreen";
import { loadActiveOrder, saveActiveOrder, clearActiveOrder, type StoredOrderRef } from "./src/storage";
import { todayDayKey } from "./src/date";
import { theme } from "./src/theme";

type Screen =
  | { name: "loading" }
  | { name: "home" }
  | { name: "scan" }
  | { name: "creating"; vendorId: string }
  | { name: "status"; ref: StoredOrderRef };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "loading" });

  useEffect(() => {
    // Pas de compte utilisateur : on ne fait que reprendre le suivi d'une
    // commande passée aujourd'hui depuis cet appareil, s'il y en a une.
    loadActiveOrder().then((ref) => {
      if (ref && ref.dayKey === todayDayKey()) {
        setScreen({ name: "status", ref });
      } else {
        if (ref) clearActiveOrder();
        setScreen({ name: "home" });
      }
    });
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />

      {screen.name === "home" && (
        <HomeScreen onScanPress={() => setScreen({ name: "scan" })} />
      )}

      {screen.name === "scan" && (
        <ScanScreen
          onVendorScanned={(vendorId) => setScreen({ name: "creating", vendorId })}
          onCancel={() => setScreen({ name: "home" })}
        />
      )}

      {screen.name === "creating" && (
        <CreatingOrderScreen
          vendorId={screen.vendorId}
          onCreated={async ({ orderId, number }) => {
            const ref: StoredOrderRef = {
              vendorId: screen.vendorId,
              orderId,
              number,
              dayKey: todayDayKey(),
            };
            await saveActiveOrder(ref);
            setScreen({ name: "status", ref });
          }}
          onCancel={() => setScreen({ name: "home" })}
        />
      )}

      {screen.name === "status" && (
        <OrderStatusScreen
          vendorId={screen.ref.vendorId}
          orderId={screen.ref.orderId}
          initialNumber={screen.ref.number}
          onDone={async () => {
            await clearActiveOrder();
            setScreen({ name: "home" });
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
