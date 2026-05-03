import type Database from "../lib/Database.js";
import type { FactoryStorageBackend } from "./types.js";

class MemoryFactoryStorageBackend implements FactoryStorageBackend {
    private readonly databases = new Map<string, Database>();

    public getDatabase(name: string): Database | undefined {
        return this.databases.get(name);
    }

    public setDatabase(database: Database): void {
        this.databases.set(database.name, database);
    }

    public deleteDatabase(name: string): void {
        this.databases.delete(name);
    }

    public entries(): IterableIterator<[string, Database]> {
        return this.databases.entries();
    }
}

export default MemoryFactoryStorageBackend;
