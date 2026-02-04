# AGENTS.md - Machine-Readable Package Context

## Package Identity

```yaml
name: "@marianmeres/midware"
version: "1.3.3"
type: "middleware-framework"
language: "TypeScript"
runtime: ["Deno", "Node.js"]
registry:
  jsr: "jsr:@marianmeres/midware"
  npm: "@marianmeres/midware"
license: "MIT"
```

## Purpose

Serial middleware execution framework. Executes functions sequentially with:
- Type-safe generic arguments
- Per-middleware and total execution timeouts
- Priority-based sorting
- Duplicate detection
- Early termination via return values

## File Map

```
src/mod.ts              → Entry point, re-exports all public API
src/midware.ts          → Midware class, MidwareUseFn type, MidwareOptions interface
src/utils/with-timeout.ts → withTimeout function, TimeoutError class
src/utils/sleep.ts      → sleep function
tests/midware.test.ts   → Test suite (11 tests)
```

## Public API Summary

### Classes

```typescript
class Midware<T extends unknown[]> {
  constructor(midwares?: MidwareUseFn<T>[], options?: MidwareOptions)
  options: MidwareOptions
  use(midware: MidwareUseFn<T>, timeout?: number): void
  unshift(midware: MidwareUseFn<T>, timeout?: number): void
  remove(midware: MidwareUseFn<T>): boolean
  clear(): void
  execute(args: T, timeout?: number): Promise<unknown>
}

class TimeoutError extends Error {}
```

### Types

```typescript
type MidwareUseFn<T extends unknown[]> = {
  (...args: T): any
  __midwarePreExecuteSortOrder?: number  // lower = higher priority
  __midwareDuplicable?: boolean          // allow duplicate registration
}

interface MidwareOptions {
  preExecuteSortEnabled?: boolean   // default: false
  duplicatesCheckEnabled?: boolean  // default: false
}
```

### Functions

```typescript
function withTimeout<T>(
  fn: CallableFunction,
  timeout?: number,        // default: 1000
  errMessage?: string
): (...args: any[]) => Promise<T>

function sleep(
  timeout: number,
  __timeout_ref__?: { id: number }
): Promise<void>
```

## Execution Model

1. `execute(args)` calls middlewares sequentially
2. Each middleware receives same `args` tuple
3. Return `undefined` → continue to next middleware
4. Return any other value → terminate chain, return that value
5. If `preExecuteSortEnabled`: sort by `__midwarePreExecuteSortOrder` first
6. Sorted order is cached until stack mutates

## Error Conditions

| Error | Trigger |
|-------|---------|
| `TypeError` | Non-function passed to `use()`/`unshift()` |
| `Error` | Duplicate middleware when `duplicatesCheckEnabled=true` |
| `TimeoutError` | Middleware or total execution exceeds timeout |

## Important Implementation Notes

1. **Timeout wrapping creates new references**: Calling `use(fn, timeout)` wraps `fn` in a new function. This breaks:
   - Duplicate detection (won't detect as duplicate)
   - `remove()` (can't remove by original reference)

2. **Sort caching**: Sorted middleware array is cached. Cache invalidated by `use()`, `unshift()`, `remove()`, `clear()`.

3. **Args normalization**: `execute()` wraps non-array args in array automatically.

4. **Options are mutable**: `options` property is public and can be modified after construction.

## Commands

```sh
deno test             # Run tests once
deno task test        # Run tests in watch mode
deno task npm:build   # Build for npm
deno task npm:publish # Build and publish to npm
```

## Code Style

- Indentation: Tabs
- Line width: 90
- Private fields: `#` prefix
- Lint: `no-explicit-any` disabled

## Common Patterns

### Request/Response Pipeline

```typescript
const app = new Midware<[Request, Response]>();
app.use((req, res) => { /* logging */ });
app.use((req, res) => { /* auth - may return early */ });
app.use((req, res) => { /* handler */ });
await app.execute([req, res]);
```

### Context Object

```typescript
const app = new Midware<[Context]>();
app.use((ctx) => { ctx.startTime = Date.now(); });
app.use((ctx) => { /* process */ });
await app.execute([{ data: "input" }]);
```

### Guard/Early Return

```typescript
app.use((ctx) => {
  if (!ctx.authorized) return { error: "Forbidden" };
  // returning non-undefined stops chain
});
```

### Priority Execution

```typescript
const auth: MidwareUseFn<[Ctx]> = (ctx) => { /* ... */ };
auth.__midwarePreExecuteSortOrder = 1; // runs first

const app = new Midware<[Ctx]>([], { preExecuteSortEnabled: true });
app.use(auth);
```

## Dependencies

None (zero external dependencies).

## Test Coverage

11 tests covering:
- Basic flow and early termination
- Error propagation
- Per-middleware timeout
- Total execution timeout
- Duplicate detection
- Priority sorting
- Remove/clear operations
- Cache invalidation
