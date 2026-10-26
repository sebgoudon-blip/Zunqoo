import { beforeEach, describe, expect, it } from "vitest";

const memory = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  key: (i: number) => [...memory.keys()][i] ?? null,
  get length() {
    return memory.size;
  },
};
// Object.keys(localStorage) doit lister les clés, comme dans un navigateur.
Object.defineProperty(globalThis, "localStorage", {
  value: new Proxy((globalThis as { localStorage: object }).localStorage, {
    ownKeys: () => [...memory.keys()],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  }),
});

const store = await import("../lib/store");

describe("store", () => {
  beforeEach(() => store.clearAll());

  it("persiste et relit une valeur", () => {
    store.setValue("progress", { "1.1": "done" });
    expect(store.getValue("progress", {})).toEqual({ "1.1": "done" });
  });

  it("n'applique une valeur distante que si elle est plus récente", () => {
    store.setValue("notes", { a: "local" });
    expect(store.applyRemote("notes", JSON.stringify({ a: "ancien" }), 1)).toBe(false);
    expect(store.applyRemote("notes", JSON.stringify({ a: "distant" }), Date.now() + 1000)).toBe(true);
    expect(store.getValue("notes", {})).toEqual({ a: "distant" });
  });

  it("exporte puis restaure une sauvegarde", () => {
    store.setValue("progress", { "1.1": "done" });
    store.setValue("profile", { firstName: "Camille" });
    const backup = store.exportBackup();
    store.clearAll();
    expect(store.getValue("progress", null)).toBeNull();
    expect(store.importBackup(JSON.parse(JSON.stringify(backup)))).toBe(2);
    expect(store.getValue("progress", null)).toEqual({ "1.1": "done" });
  });

  it("refuse un fichier qui n'est pas une sauvegarde", () => {
    expect(() => store.importBackup({ foo: 1 })).toThrow();
    expect(() => store.importBackup(null)).toThrow();
  });
});
