import { DatabaseSync } from "node:sqlite";
import { deserialize, serialize } from "node:v8";
import FDBKeyRange from "../FDBKeyRange.js";
import InMemoryDatabase from "../lib/Database.js";
import Index from "../lib/Index.js";
import ObjectStore from "../lib/ObjectStore.js";
import { cmpKeys } from "../lib/cmp.js";
import type Database from "../lib/Database.js";
import type { Key, Record } from "../lib/types.js";
import type { FactoryStorageBackend } from "./types.js";

const encode = (value: unknown): Uint8Array => serialize(value);
const decode = <T>(value: Uint8Array): T => deserialize(value);

class SQLiteFactoryStorageBackend implements FactoryStorageBackend {
    private readonly sqlite: DatabaseSync;
    private readonly databases = new Map<string, Database>();
    private readonly activeWriteTransactions = new Set<string>();

    constructor(filename: string = ":memory:") {
        this.sqlite = new DatabaseSync(filename);
        this.sqlite.exec(`
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS fdb_databases (
                name TEXT PRIMARY KEY,
                version INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS fdb_object_stores (
                database_name TEXT NOT NULL,
                name TEXT NOT NULL,
                key_path BLOB,
                auto_increment INTEGER NOT NULL,
                key_generator_num INTEGER,
                PRIMARY KEY (database_name, name),
                FOREIGN KEY (database_name) REFERENCES fdb_databases(name) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS fdb_indexes (
                database_name TEXT NOT NULL,
                object_store_name TEXT NOT NULL,
                name TEXT NOT NULL,
                key_path BLOB NOT NULL,
                multi_entry INTEGER NOT NULL,
                is_unique INTEGER NOT NULL,
                PRIMARY KEY (database_name, object_store_name, name),
                FOREIGN KEY (database_name, object_store_name)
                    REFERENCES fdb_object_stores(database_name, name) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS fdb_object_store_records (
                database_name TEXT NOT NULL,
                object_store_name TEXT NOT NULL,
                key BLOB NOT NULL,
                value BLOB NOT NULL,
                PRIMARY KEY (database_name, object_store_name, key),
                FOREIGN KEY (database_name, object_store_name)
                    REFERENCES fdb_object_stores(database_name, name) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS fdb_index_records (
                database_name TEXT NOT NULL,
                object_store_name TEXT NOT NULL,
                index_name TEXT NOT NULL,
                key BLOB NOT NULL,
                value BLOB NOT NULL,
                PRIMARY KEY (database_name, object_store_name, index_name, key, value),
                FOREIGN KEY (database_name, object_store_name, index_name)
                    REFERENCES fdb_indexes(database_name, object_store_name, name) ON DELETE CASCADE
            );
        `);

        this.loadAll();
    }

    private loadAll() {
        const dbRows = this.sqlite
            .prepare("SELECT name, version FROM fdb_databases")
            .all() as { name: string; version: number }[];

        for (const dbRow of dbRows) {
            const database = new InMemoryDatabase(dbRow.name, dbRow.version);

            const objectStoreRows = this.sqlite
                .prepare(
                    "SELECT name, key_path, auto_increment, key_generator_num FROM fdb_object_stores WHERE database_name = ?",
                )
                .all(dbRow.name) as {
                name: string;
                key_path: Uint8Array | null;
                auto_increment: number;
                key_generator_num: number | null;
            }[];

            for (const row of objectStoreRows) {
                const objectStore = new ObjectStore(
                    database,
                    row.name,
                    row.key_path === null ? null : decode(row.key_path),
                    !!row.auto_increment,
                );

                if (
                    objectStore.keyGenerator &&
                    row.key_generator_num !== null
                ) {
                    objectStore.keyGenerator.num = row.key_generator_num;
                }

                const objectStoreRecords = this.sqlite
                    .prepare(
                        "SELECT key, value FROM fdb_object_store_records WHERE database_name = ? AND object_store_name = ?",
                    )
                    .all(dbRow.name, row.name) as {
                    key: Uint8Array;
                    value: Uint8Array;
                }[];

                for (const record of objectStoreRecords) {
                    objectStore.records.put({
                        key: decode(record.key),
                        value: decode(record.value),
                    });
                }

                const indexRows = this.sqlite
                    .prepare(
                        "SELECT name, key_path, multi_entry, is_unique FROM fdb_indexes WHERE database_name = ? AND object_store_name = ?",
                    )
                    .all(dbRow.name, row.name) as {
                    name: string;
                    key_path: Uint8Array;
                    multi_entry: number;
                    is_unique: number;
                }[];

                for (const indexRow of indexRows) {
                    const index = new Index(
                        objectStore,
                        indexRow.name,
                        decode(indexRow.key_path),
                        !!indexRow.multi_entry,
                        !!indexRow.is_unique,
                    );

                    const indexRecords = this.sqlite
                        .prepare(
                            "SELECT key, value FROM fdb_index_records WHERE database_name = ? AND object_store_name = ? AND index_name = ?",
                        )
                        .all(dbRow.name, row.name, indexRow.name) as {
                        key: Uint8Array;
                        value: Uint8Array;
                    }[];

                    for (const record of indexRecords) {
                        index.records.put({
                            key: decode(record.key),
                            value: decode(record.value),
                        });
                    }

                    index.initialized = true;
                    objectStore.rawIndexes.set(index.name, index);
                }

                database.rawObjectStores.set(objectStore.name, objectStore);
            }

            database.sqliteReadBackend = this;
            this.databases.set(dbRow.name, database);
        }
    }

    public getDatabase(name: string): Database | undefined {
        return this.databases.get(name);
    }

    public setDatabase(database: Database): void {
        database.sqliteReadBackend = this;
        this.databases.set(database.name, database);
    }

    public deleteDatabase(name: string): void {
        this.databases.delete(name);
        this.sqlite
            .prepare("DELETE FROM fdb_databases WHERE name = ?")
            .run(name);
    }

    public entries(): IterableIterator<[string, Database]> {
        return this.databases.entries();
    }

    public getObjectStoreRecord(
        databaseName: string,
        objectStoreName: string,
        query: FDBKeyRange | Key,
    ): Record | undefined {
        const range =
            query instanceof FDBKeyRange ? query : FDBKeyRange.only(query);
        const rows = this.sqlite
            .prepare(
                "SELECT key, value FROM fdb_object_store_records WHERE database_name = ? AND object_store_name = ?",
            )
            .all(databaseName, objectStoreName) as {
            key: Uint8Array;
            value: Uint8Array;
        }[];

        const records = rows
            .map((row) => ({ key: decode(row.key), value: decode(row.value) }))
            .filter((record) => range.includes(record.key))
            .sort((a, b) => cmpKeys(a.key, b.key));

        return records[0];
    }

    public getObjectStoreRecords(
        databaseName: string,
        objectStoreName: string,
        query: FDBKeyRange,
        direction: "next" | "prev" = "next",
    ): Record[] {
        const rows = this.sqlite
            .prepare(
                "SELECT key, value FROM fdb_object_store_records WHERE database_name = ? AND object_store_name = ?",
            )
            .all(databaseName, objectStoreName) as {
            key: Uint8Array;
            value: Uint8Array;
        }[];

        const sorted = rows
            .map((row) => ({ key: decode(row.key), value: decode(row.value) }))
            .filter((record) => query.includes(record.key))
            .sort((a, b) => cmpKeys(a.key, b.key));

        if (direction === "prev") {
            sorted.reverse();
        }

        return sorted;
    }

    public getIndexRecord(
        databaseName: string,
        objectStoreName: string,
        indexName: string,
        query: FDBKeyRange | Key,
    ): Record | undefined {
        const range =
            query instanceof FDBKeyRange ? query : FDBKeyRange.only(query);
        const rows = this.sqlite
            .prepare(
                "SELECT key, value FROM fdb_index_records WHERE database_name = ? AND object_store_name = ? AND index_name = ?",
            )
            .all(databaseName, objectStoreName, indexName) as {
            key: Uint8Array;
            value: Uint8Array;
        }[];

        const records = rows
            .map((row) => ({ key: decode(row.key), value: decode(row.value) }))
            .filter((record) => range.includes(record.key))
            .sort((a, b) => cmpKeys(a.key, b.key));

        return records[0];
    }

    public getIndexRecords(
        databaseName: string,
        objectStoreName: string,
        indexName: string,
        query: FDBKeyRange,
        direction: "next" | "prev" | "nextunique" | "prevunique" = "next",
    ): Record[] {
        const rows = this.sqlite
            .prepare(
                "SELECT key, value FROM fdb_index_records WHERE database_name = ? AND object_store_name = ? AND index_name = ?",
            )
            .all(databaseName, objectStoreName, indexName) as {
            key: Uint8Array;
            value: Uint8Array;
        }[];

        const sorted = rows
            .map((row) => ({ key: decode(row.key), value: decode(row.value) }))
            .filter((record) => query.includes(record.key))
            .sort((a, b) => {
                const keyCmp = cmpKeys(a.key, b.key);
                if (keyCmp !== 0) {
                    return keyCmp;
                }
                return cmpKeys(a.value, b.value);
            });

        if (direction === "prev" || direction === "prevunique") {
            sorted.reverse();
        }

        return sorted;
    }

    public onWriteTransactionStart(database: Database): void {
        if (this.activeWriteTransactions.has(database.name)) {
            return;
        }
        this.sqlite.exec("BEGIN IMMEDIATE");
        this.activeWriteTransactions.add(database.name);
    }

    public onWriteTransactionCommit(database: Database): void {
        if (!this.activeWriteTransactions.has(database.name)) {
            return;
        }

        try {
            this.sqlite
                .prepare(
                    "INSERT INTO fdb_databases (name, version) VALUES (?, ?) " +
                        "ON CONFLICT(name) DO UPDATE SET version=excluded.version",
                )
                .run(database.name, database.version);

            this.sqlite
                .prepare(
                    "DELETE FROM fdb_object_stores WHERE database_name = ?",
                )
                .run(database.name);

            for (const objectStore of database.rawObjectStores.values()) {
                if (objectStore.deleted) {
                    continue;
                }

                this.sqlite
                    .prepare(
                        "INSERT INTO fdb_object_stores (database_name, name, key_path, auto_increment, key_generator_num) VALUES (?, ?, ?, ?, ?)",
                    )
                    .run(
                        database.name,
                        objectStore.name,
                        objectStore.keyPath === null
                            ? null
                            : encode(objectStore.keyPath),
                        objectStore.autoIncrement ? 1 : 0,
                        objectStore.keyGenerator?.num ?? null,
                    );

                for (const record of objectStore.records.values()) {
                    this.sqlite
                        .prepare(
                            "INSERT INTO fdb_object_store_records (database_name, object_store_name, key, value) VALUES (?, ?, ?, ?)",
                        )
                        .run(
                            database.name,
                            objectStore.name,
                            encode(record.key),
                            encode(record.value),
                        );
                }

                for (const index of objectStore.rawIndexes.values()) {
                    if (index.deleted) {
                        continue;
                    }

                    this.sqlite
                        .prepare(
                            "INSERT INTO fdb_indexes (database_name, object_store_name, name, key_path, multi_entry, is_unique) VALUES (?, ?, ?, ?, ?, ?)",
                        )
                        .run(
                            database.name,
                            objectStore.name,
                            index.name,
                            encode(index.keyPath),
                            index.multiEntry ? 1 : 0,
                            index.unique ? 1 : 0,
                        );

                    for (const record of index.records.values()) {
                        this.sqlite
                            .prepare(
                                "INSERT INTO fdb_index_records (database_name, object_store_name, index_name, key, value) VALUES (?, ?, ?, ?, ?)",
                            )
                            .run(
                                database.name,
                                objectStore.name,
                                index.name,
                                encode(record.key),
                                encode(record.value),
                            );
                    }
                }
            }

            this.sqlite.exec("COMMIT");
            this.activeWriteTransactions.delete(database.name);
        } catch (error) {
            this.sqlite.exec("ROLLBACK");
            this.activeWriteTransactions.delete(database.name);
            throw error;
        }
    }

    public onWriteTransactionAbort(database: Database): void {
        if (!this.activeWriteTransactions.has(database.name)) {
            return;
        }
        this.sqlite.exec("ROLLBACK");
        this.activeWriteTransactions.delete(database.name);
    }
}

export default SQLiteFactoryStorageBackend;
