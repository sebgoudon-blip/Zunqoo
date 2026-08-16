import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "zunqoo.activeOrder";

export interface StoredOrderRef {
  vendorId: string;
  orderId: string;
  number: number;
  dayKey: string;
}

export async function saveActiveOrder(ref: StoredOrderRef): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ref));
}

export async function loadActiveOrder(): Promise<StoredOrderRef | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredOrderRef;
  } catch {
    return null;
  }
}

export async function clearActiveOrder(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
