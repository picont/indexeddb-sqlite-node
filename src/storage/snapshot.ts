import Database from "../lib/Database.js";
import Index from "../lib/Index.js";
import ObjectStore from "../lib/ObjectStore.js";
import type { Key, KeyPath, Value } from "../lib/types.js";

interface SnapshotRecord {
    key: Key;
    value: Value;
}

interface SnapshotIndex {
    name: string;
    keyPath: KeyPath;
    multiEntry: boolean;
    unique: boolean;
    records: SnapshotRecord[];
}

interface SnapshotObjectStore {
    name: string;
    keyPath: KeyPath | null;
    autoIncrement: boolean;
    keyGeneratorNum: number | null;
    records: SnapshotRecord[];
    indexes: SnapshotIndex[];
}

export interface DatabaseSnapshot {
    name: string;
    version: number;
    objectStores: SnapshotObjectStore[];
}

export const serializeDatabase = (database: Database): DatabaseSnapshot => {
    const objectStores: SnapshotObjectStore[] = [];

    for (const objectStore of database.rawObjectStores.values()) {
        if (objectStore.deleted) {
            continue;
        }

        const records: SnapshotRecord[] = [];
        for (const record of objectStore.records.values()) {
            records.push({
                key: structuredClone(record.key),
                value: structuredClone(record.value),
            });
        }

        const indexes: SnapshotIndex[] = [];
        for (const index of objectStore.rawIndexes.values()) {
            if (index.deleted) {
                continue;
            }

            const indexRecords: SnapshotRecord[] = [];
            for (const record of index.records.values()) {
                indexRecords.push({
                    key: structuredClone(record.key),
                    value: structuredClone(record.value),
                });
            }

            indexes.push({
                name: index.name,
                keyPath: structuredClone(index.keyPath),
                multiEntry: index.multiEntry,
                unique: index.unique,
                records: indexRecords,
            });
        }

        objectStores.push({
            name: objectStore.name,
            keyPath: structuredClone(objectStore.keyPath),
            autoIncrement: objectStore.autoIncrement,
            keyGeneratorNum: objectStore.keyGenerator?.num ?? null,
            records,
            indexes,
        });
    }

    return {
        name: database.name,
        version: database.version,
        objectStores,
    };
};

export const deserializeDatabase = (snapshot: DatabaseSnapshot): Database => {
    const database = new Database(snapshot.name, snapshot.version);

    for (const objectStoreSnapshot of snapshot.objectStores) {
        const objectStore = new ObjectStore(
            database,
            objectStoreSnapshot.name,
            objectStoreSnapshot.keyPath,
            objectStoreSnapshot.autoIncrement,
        );

        if (
            objectStore.keyGenerator &&
            objectStoreSnapshot.keyGeneratorNum !== null
        ) {
            objectStore.keyGenerator.num = objectStoreSnapshot.keyGeneratorNum;
        }

        for (const record of objectStoreSnapshot.records) {
            objectStore.records.put({
                key: structuredClone(record.key),
                value: structuredClone(record.value),
            });
        }

        for (const indexSnapshot of objectStoreSnapshot.indexes) {
            const index = new Index(
                objectStore,
                indexSnapshot.name,
                indexSnapshot.keyPath,
                indexSnapshot.multiEntry,
                indexSnapshot.unique,
            );

            for (const record of indexSnapshot.records) {
                index.records.put({
                    key: structuredClone(record.key),
                    value: structuredClone(record.value),
                });
            }

            index.initialized = true;
            objectStore.rawIndexes.set(index.name, index);
        }

        database.rawObjectStores.set(objectStore.name, objectStore);
    }

    return database;
};
