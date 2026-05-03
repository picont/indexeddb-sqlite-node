# IndexedDB SQLite for Node.js

A Node.js implementation of the IndexedDB API with a persistent SQLite storage backend.

This project started as a fork of [`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB), but its goal is different: provide IndexedDB semantics for server-side/Node.js applications where data can persist across process restarts. The original in-memory behavior is still available for tests and compatibility, but SQLite persistence is the primary direction for this repo.

## Status

Experimental. The SQLite backend is usable for single-process Node.js workloads, but the project is still evolving and should be treated as pre-stable infrastructure.

Current limitations:

- Node.js only for SQLite persistence (`node:sqlite`).
- Cross-process IndexedDB coordination is not implemented yet. In particular, `blocked`/`versionchange` behavior across separate Node processes is not coordinated.
- SQLite writes are serialized per backend instance/SQLite connection.
- Some internals still come from fake-indexeddb and will likely be refactored as the SQLite backend becomes more native.

## Installation

```sh
npm install fake-indexeddb
```

> Package naming is currently inherited from fake-indexeddb. Expect this README/project to move toward a SQLite-focused identity over time.

## Quick start: persistent SQLite IndexedDB

```js
import { IDBFactory } from "fake-indexeddb";
import { SQLiteFactoryStorageBackend } from "fake-indexeddb/sqlite";

const indexedDB = new IDBFactory({
    storage: new SQLiteFactoryStorageBackend("./indexeddb.sqlite"),
});

const request = indexedDB.open("app", 1);

request.onupgradeneeded = () => {
    const db = request.result;
    const store = db.createObjectStore("books", { keyPath: "isbn" });
    store.createIndex("by_title", "title", { unique: true });
};

request.onsuccess = () => {
    const db = request.result;

    const tx = db.transaction("books", "readwrite");
    const store = tx.objectStore("books");

    store.put({
        title: "Quarry Memories",
        author: "Fred",
        isbn: 123456,
    });

    tx.oncomplete = () => {
        console.log("Persisted to SQLite");
        db.close();
    };
};
```

Reopening with the same SQLite file will load the persisted IndexedDB metadata and records.

## In-memory compatibility mode

If no storage backend is provided, `IDBFactory` uses the in-memory backend:

```js
import { IDBFactory } from "fake-indexeddb";

const indexedDB = new IDBFactory();
```

You can also keep using the fake-indexeddb-compatible global installer:

```js
import "fake-indexeddb/auto";

const request = indexedDB.open("test", 1);
```

This mode is useful for tests and for compatibility with existing fake-indexeddb usage, but it does not persist data.

## Explicit imports

```js
import {
    indexedDB,
    IDBCursor,
    IDBCursorWithValue,
    IDBDatabase,
    IDBFactory,
    IDBIndex,
    IDBKeyRange,
    IDBObjectStore,
    IDBOpenDBRequest,
    IDBRequest,
    IDBTransaction,
    IDBVersionChangeEvent,
} from "fake-indexeddb";
```

SQLite backend:

```js
import { SQLiteFactoryStorageBackend } from "fake-indexeddb/sqlite";
```

## Transaction behavior with SQLite

The SQLite backend persists write transactions using SQLite transactions:

- write transaction start: `BEGIN IMMEDIATE`
- commit: snapshot metadata/records and `COMMIT`
- abort: `ROLLBACK`

Within a readwrite transaction, reads observe that transaction's own writes. Readonly transactions may read from the persisted SQLite backend.

Because a single SQLite connection has one transaction state, write transactions are serialized across all logical IndexedDB database names for a single `SQLiteFactoryStorageBackend` instance.

## TypeScript

TypeScript declarations are inherited from fake-indexeddb and are based on TypeScript's built-in IndexedDB DOM types. This keeps compatibility with code that already uses standard IndexedDB types.

## Using with Dexie and other IndexedDB wrappers

Global setup:

```js
import "fake-indexeddb/auto";
import Dexie from "dexie";

const db = new Dexie("MyDatabase");
```

Explicit setup:

```js
import Dexie from "dexie";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";

const db = new Dexie("MyDatabase", { indexedDB, IDBKeyRange });
```

For persistent SQLite-backed usage, prefer constructing an `IDBFactory` with `SQLiteFactoryStorageBackend` and passing that factory to libraries that support custom IndexedDB implementations.

## Testing

Common validation commands:

```sh
pnpm run lint
pnpm run build
pnpm run test-mocha
pnpm run test-w3c
pnpm test
```

## Relationship to fake-indexeddb

This repository currently retains much of fake-indexeddb's API surface, tests, and compatibility behavior. Credit goes to the fake-indexeddb project for the original in-memory IndexedDB implementation.

Going forward, this repo's focus is SQLite-backed persistence in Node.js rather than being only a browser IndexedDB mock.

## License

Apache 2.0
