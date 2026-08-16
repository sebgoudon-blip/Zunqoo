import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "../theme";

interface Props {
  onScanPress: () => void;
}

export function HomeScreen({ onScanPress }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Zunqoo</Text>
      <Text style={styles.tagline}>
        Commandez au comptoir, suivez votre commande d'ici.
      </Text>

      <TouchableOpacity style={styles.scanButton} onPress={onScanPress} activeOpacity={0.85}>
        <Text style={styles.scanButtonText}>Scanner le QR code</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>
        Le QR code est affiché sur le comptoir du foodtruck.
      </Text>
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
  logo: {
    fontSize: 44,
    fontWeight: "900",
    color: theme.colors.primary,
    marginBottom: theme.spacing(1),
  },
  tagline: {
    fontSize: 18,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginBottom: theme.spacing(6),
  },
  scanButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing(3),
    paddingHorizontal: theme.spacing(5),
    borderRadius: theme.radius,
    width: "100%",
  },
  scanButtonText: {
    color: "white",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  hint: {
    marginTop: theme.spacing(3),
    color: theme.colors.textMuted,
    fontSize: 14,
    textAlign: "center",
  },
});
