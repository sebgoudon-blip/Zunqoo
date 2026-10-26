import { describe, expect, it } from "vitest";
import { validateLegalInfo } from "../lib/validation";
import { policies, profile } from "./fixtures";

describe("validateLegalInfo", () => {
  it("accepte un profil complet et cohérent", () => {
    expect(validateLegalInfo(profile, policies)).toEqual({});
  });

  it("vérifie le SIREN/SIRET en France", () => {
    expect(validateLegalInfo({ ...profile, registrationNumber: "1234" }, policies).registrationNumber).toBeDefined();
    expect(validateLegalInfo({ ...profile, registrationNumber: "123 456 789 00012" }, policies).registrationNumber).toBeUndefined();
  });

  it("vérifie le préfixe et le format de la TVA", () => {
    expect(validateLegalInfo({ ...profile, vatNumber: "BE0123456789" }, policies).vatNumber).toContain("FR");
    expect(validateLegalInfo({ ...profile, vatNumber: "FR123" }, policies).vatNumber).toBeDefined();
  });

  it("refuse une URL .myshopify.com ou sans https", () => {
    expect(validateLegalInfo({ ...profile, storeUrl: "https://shop.myshopify.com" }, policies).storeUrl).toBeDefined();
    expect(validateLegalInfo({ ...profile, storeUrl: "www.tamarque.fr" }, policies).storeUrl).toBeDefined();
  });

  it("exige le médiateur en France seulement", () => {
    const noMediator = { ...policies, mediator: "" };
    expect(validateLegalInfo(profile, noMediator).mediator).toBeDefined();
    expect(validateLegalInfo({ ...profile, country: "BE", registrationNumber: "0123456789", vatNumber: "" }, noMediator).mediator).toBeUndefined();
  });

  it("refuse un délai de retour sous le minimum légal dans l'UE", () => {
    expect(validateLegalInfo(profile, { ...policies, returnDays: 7 }).returnDays).toBeDefined();
  });
});
