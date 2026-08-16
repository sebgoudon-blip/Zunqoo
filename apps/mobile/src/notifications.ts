import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Demande la permission de notification et renvoie le token FCM natif de
 * l'appareil (pas un "Expo push token" : on veut parler directement à
 * Firebase Cloud Messaging comme demandé dans le cahier des charges).
 *
 * Nécessite un build "dev client" ou standalone (EAS Build) — les tokens
 * d'appareil natifs ne sont pas disponibles dans Expo Go. Renvoie `null`
 * si la permission est refusée ou si l'environnement ne le permet pas ;
 * l'app reste utilisable sans notification, l'écran d'affichage du
 * foodtruck servant de filet de sécurité.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("orders", {
        name: "Commandes",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      return null;
    }

    const token = await Notifications.getDevicePushTokenAsync();
    return token.data;
  } catch (err) {
    console.warn("Notifications push indisponibles sur cet environnement :", err);
    return null;
  }
}
