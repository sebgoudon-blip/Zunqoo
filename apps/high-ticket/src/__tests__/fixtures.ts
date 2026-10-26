import { DEFAULT_POLICIES, type StorePolicies } from "../lib/legal";
import type { Profile } from "../types";

export const profile: Profile = {
  firstName: "Camille Martin",
  hasCompany: true,
  country: "FR",
  legalForm: "SASU",
  budget: 1000,
  addressType: "domiciliation",
  companyName: "Ma Société SAS",
  registrationNumber: "123 456 789",
  vatNumber: "FR12123456789",
  address: "12 rue Exemple, 75001 Paris, France",
  email: "contact@tamarque.fr",
  phone: "+33 6 12 34 56 78",
  storeName: "Ma Marque",
  storeUrl: "https://www.tamarque.fr",
};

export const policies: StorePolicies = { ...DEFAULT_POLICIES, mediator: "Médiateur Exemple, 1 rue X, Paris" };
