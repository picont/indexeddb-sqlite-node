# SQLite-backed fakeIndexedDB Plan

## Goal
Build a persistent IndexedDB implementation for Node.js using `node:sqlite`, refactoring freely as needed while preserving IndexedDB API behavior and existing test coverage targets.

## Development Loop
For every meaningful iteration:
1. Implement a small, focused change.
2. Run relevant tests first (targeted).
3. Run full suite regularly (`pnpm test`).
4. Commit only green changes.

## Milestones

### M0 - Baseline + Harness
- [ ] Confirm branch baseline is green (`pnpm test`).
- [ ] Add a short `docs/dev-workflow.md` with test commands and iteration policy.

### M1 - Storage Architecture Refactor
- [ ] Introduce storage interfaces (catalog/object-store/index/transaction ops).
- [ ] Add an in-memory adapter behind the new interfaces (behavior-preserving).
- [ ] Keep all current tests passing.

### M2 - SQLite Backend (Core)
- [ ] Add SQLite adapter using `node:sqlite`.
- [ ] Add persistent metadata schema (databases, stores, indexes).
- [ ] Add record storage tables and CRUD paths.
- [ ] Map IDB transaction lifecycle to SQL transactions.

### M3 - Key Encoding + Ordering Correctness
- [ ] Implement canonical IndexedDB key encoding.
- [ ] Ensure ordering matches IndexedDB comparison semantics.
- [ ] Verify range scans + cursor ordering across edge cases.

### M4 - Indexes + Constraints
- [ ] Persist and maintain secondary index entries.
- [ ] Enforce unique constraints with proper error behavior.
- [ ] Ensure index rebuild/upgrade behavior matches IDB expectations.

### M5 - Event/Timing Fidelity
- [ ] Validate request success/error ordering.
- [ ] Validate abort/rollback behavior and event bubbling/default actions.
- [ ] Validate blocked/versionchange/open/delete edge cases.

### M6 - Public API for Persistence
- [ ] Define constructor/config API for SQLite-backed factory.
- [ ] Add usage docs (in-memory vs persisted).
- [ ] Add examples for persistent usage in Node.js.

### M7 - Hardening
- [ ] Run full test suite repeatedly during cleanup.
- [ ] Add backend-focused regression tests.
- [ ] Performance sanity checks (large puts/cursors/index scans).

## Iteration 1 (Start Here)
- [ ] Create storage interface module (`src/storage/types.ts`).
- [ ] Identify and list direct in-memory touchpoints to migrate first:
  - `FDBFactory` database registry
  - `Database` / `ObjectStore` / `Index` record paths
  - cursor record iteration sources
- [ ] Add no-op wiring so code compiles unchanged.
- [ ] Run: `pnpm run lint && pnpm run test-jest`.

## Test Commands
- Fast checks:
  - `pnpm run lint`
  - `pnpm run test-jest`
- Full checks:
  - `pnpm run test-w3c`
  - `pnpm test`
