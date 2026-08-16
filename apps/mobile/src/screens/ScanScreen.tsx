import { useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { theme } from "../theme";
import { parseVendorIdFromQr } from "../qr";

interface Props {
  onVendorScanned: (vendorId: string) => void;
  onCancel: () => void;
}

export function ScanScreen({ onVendorScanned, onCancel }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanError, setScanError] = useState<string | null>(null);
  const handledRef = useRef(false);

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (handledRef.current) return;
    const vendorId = parseVendorIdFromQr(result.data);
    if (!vendorId) {
      setScanError("QR code non reconnu. Essayez à nouveau.");
      return;
    }
    handledRef.current = true;
    onVendorScanned(vendorId);
  }

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>
          L'accès à l'appareil photo est nécessaire pour scanner le QR code.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Autoriser l'appareil photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={handleBarcodeScanned}
      />
      <View style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.overlayText}>
          {scanError ?? "Visez le QR code du foodtruck"}
        </Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Annuler</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing(4),
    backgroundColor: theme.colors.background,
  },
  message: {
    fontSize: 18,
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: theme.spacing(3),
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 4,
    borderColor: "white",
    borderRadius: 24,
    marginBottom: theme.spacing(4),
  },
  overlayText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: theme.spacing(4),
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing(2),
    paddingHorizontal: theme.spacing(4),
    borderRadius: theme.radius,
    marginTop: theme.spacing(2),
  },
  primaryButtonText: { color: "white", fontSize: 18, fontWeight: "700" },
  secondaryButton: { marginTop: theme.spacing(3), padding: theme.spacing(2) },
  secondaryButtonText: {
    color: theme.colors.textMuted,
    fontSize: 16,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
