import type { EntityId } from "@/app/lib/tools/plex/domain/models";

export interface Identifiable {
  id: EntityId;
}

export interface Repository<T extends Identifiable> {
  list(): T[];
  get(id: EntityId): T | null;
  save(value: T): void;
  remove(id: EntityId): void;
  clear(): void;
}
