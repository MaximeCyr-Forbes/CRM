import type { EntityId } from "@/app/lib/tools/plex/domain/models";
import type { Identifiable, Repository } from "../repository";

type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class LocalStorageDataError extends Error {
  constructor(key: string) {
    super(`Les données locales associées à « ${key} » sont invalides.`);
    this.name = "LocalStorageDataError";
  }
}

export class LocalStorageRepository<T extends Identifiable>
  implements Repository<T>
{
  constructor(
    private readonly key: string,
    private readonly storage: StoragePort,
  ) {}

  list(): T[] {
    const serializedValues = this.storage.getItem(this.key);

    if (serializedValues === null) {
      return [];
    }

    try {
      const values: unknown = JSON.parse(serializedValues);
      if (!Array.isArray(values)) {
        throw new LocalStorageDataError(this.key);
      }
      return values as T[];
    } catch (error) {
      if (error instanceof LocalStorageDataError) {
        throw error;
      }
      throw new LocalStorageDataError(this.key);
    }
  }

  get(id: EntityId): T | null {
    return this.list().find((value) => value.id === id) ?? null;
  }

  save(value: T): void {
    const values = this.list();
    const existingIndex = values.findIndex((item) => item.id === value.id);

    if (existingIndex === -1) {
      values.push(value);
    } else {
      values[existingIndex] = value;
    }

    this.storage.setItem(this.key, JSON.stringify(values));
  }

  remove(id: EntityId): void {
    const values = this.list().filter((value) => value.id !== id);
    this.storage.setItem(this.key, JSON.stringify(values));
  }

  clear(): void {
    this.storage.removeItem(this.key);
  }
}
