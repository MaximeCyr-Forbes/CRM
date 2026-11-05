import { describe, expect, it } from "vitest";
import {
  LocalStorageDataError,
  LocalStorageRepository,
} from "@/app/lib/tools/plex/infrastructure/storage/local/LocalStorageRepository";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("LocalStorageRepository", () => {
  it("ajoute puis remplace une entité avec le même identifiant", () => {
    const storage = new MemoryStorage();
    const repository = new LocalStorageRepository<{ id: string; name: string }>(
      "properties",
      storage,
    );

    repository.save({ id: "property-1", name: "Premier nom" });
    repository.save({ id: "property-1", name: "Nom révisé" });

    expect(repository.list()).toEqual([
      { id: "property-1", name: "Nom révisé" },
    ]);
  });

  it("signale clairement des données locales invalides", () => {
    const storage = new MemoryStorage();
    storage.setItem("properties", "invalid-json");
    const repository = new LocalStorageRepository("properties", storage);

    expect(() => repository.list()).toThrow(LocalStorageDataError);
  });
});
