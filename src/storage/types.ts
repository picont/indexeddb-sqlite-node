import type Database from "../lib/Database.js";
import type FDBKeyRange from "../FDBKeyRange.js";
import type { Key, Record } from "../lib/types.js";

export interface SQLiteReadBackend {
    getObjectStoreRecord(
        databaseName: string,
        objectStoreName: string,
        query: FDBKeyRange | Key,
    ): Record | undefined;
    getObjectStoreRecords(
        databaseName: string,
        objectStoreName: string,
        query: FDBKeyRange,
        direction?: "next" | "prev",
    ): Record[];
    getIndexRecord(
        databaseName: string,
        objectStoreName: string,
        indexName: string,
        query: FDBKeyRange | Key,
    ): Record | undefined;
    getIndexRecords(
        databaseName: string,
        objectStoreName: string,
        indexName: string,
        query: FDBKeyRange,
        direction?: "next" | "prev" | "nextunique" | "prevunique",
    ): Record[];
}

export interface FactoryStorageBackend {
    getDatabase(name: string): Database | undefined;
    setDatabase(database: Database): void;
    deleteDatabase(name: string): void;
    entries(): IterableIterator<[string, Database]>;

    canStartWriteTransaction?(database: Database): boolean;
    onWriteTransactionStart?(database: Database): void;
    onWriteTransactionCommit?(database: Database): void;
    onWriteTransactionAbort?(database: Database): void;
}

export interface FDBFactoryOptions {
    storage?: FactoryStorageBackend;
}
