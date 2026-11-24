# AGENTS.md - Machine-Readable Package Context

## Package Identity

```yaml
name: "@marianmeres/midware"
version: "see package.json (the manifest of record)"
type: "middleware-framework"
language: "TypeScript (erasable-only)"
runtime: "Node LTS (.node-version) is the dev runtime and the gate; the source uses web standards only, so it runs anywhere"
tooling: ["pnpm", "node:test", "tsc", "Biome"]
registry:
  npm: "@marianmeres/midware"      # dist/ built by tsc from package.json
  jsr: "jsr:@marianmeres/midware"  # .ts source via jsr.json (no version; set at publish)
license: "MIT"
```

## Purpose

Serial middleware execution framework. Executes functions sequentially with:

- Type-safe generic arguments AND return type
- Per-middleware and total execution timeouts
- Priority-based sorting (re-evaluated on every execute)
- Duplicate detection (works with timeout-wrapped middlewares)
- Early termination via return values
- Cooperative cancellation via AbortSignal

## File Map

```
src/mod.ts              → Entry point, re-exports all public API
src/midware.ts          → Midware class, MidwareUseFn, MidwareOptions, MidwareExecuteOptions
src/utils/with-timeout.ts → withTimeout function, TimeoutError class
src/utils/sleep.ts      → sleep function, SleepTimeoutRef type
tests/midware.test.ts   → Test suite (26 tests, node:test + node:assert/strict)
package.json            → manifest of record: version, npm exports, scripts
jsr.json                → JSR manifest: exports, publish.include (no version)
tsconfig.json           → type gate (src + tests, noEmit)
tsconfig.build.json     → src → dist (ESM + .d.ts) for npm
biome.json              → format + lint (warn-list: useIterableCallbackReturn)
```

## Public API Summary

### Classes

```typescript
class Midware<T extends unknown[], R = unknown> {
  constructor(midwares?: MidwareUseFn<T>[], options?: MidwareOptions)
  options: MidwareOptions
  readonly size: number
  readonly middlewares: readonly MidwareUseFn<T>[]
  use(midware: MidwareUseFn<T>, timeout?: number): void
  unshift(midware: MidwareUseFn<T>, timeout?: number): void
  remove(midware: MidwareUseFn<T>): boolean
  clear(): void
  execute(
    args: T,
    timeoutOrOptions?: number | MidwareExecuteOptions,
  ): Promise<R | undefined>
}

class TimeoutError extends Error {
  override name = "TimeoutError"
}
```

### Types

```typescript
type MidwareUseFn<T extends unknown[]> = {
  (...args: T): any
  __midwarePreExecuteSortOrder?: number  // lower = higher priority
  __midwareDuplicable?: boolean          // allow duplicate registration
  __midwareOriginal?: MidwareUseFn<T>    // internal: back-ref through timeout wrappers
}

interface MidwareOptions {
  preExecuteSortEnabled?: boolean   // default: false
  duplicatesCheckEnabled?: boolean  // default: false
}

interface MidwareExecuteOptions {
  timeout?: number     // total execution timeout (ms)
  signal?: AbortSignal // cooperative cancellation
}

interface SleepTimeoutRef {
  id: number
}
```

### Functions

```typescript
function withTimeout<
  TReturn = unknown,
  TArgs extends readonly unknown[] = any[],
>(
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
  timeout?: number,   // default: 1000; <= 0 means "no timeout"
  errMessage?: string,
): (...args: TArgs) => Promise<TReturn>

function sleep(
  timeout: number,
  refOrSignal?: SleepTimeoutRef | AbortSignal,
): Promise<void>
```

## Execution Model

1. `execute(args)` calls middlewares sequentially
2. Each middleware receives same `args` tuple
3. Return `undefined` → continue to next middleware
4. Return any other value → terminate chain, return that value (typed as `R`)
5. If `preExecuteSortEnabled`: sort by `__midwarePreExecuteSortOrder` on **every** execute (no caching)
6. If `signal` provided: checked before each middleware, throws `signal.reason` if aborted
7. Non-array `args` is auto-wrapped to a single-element array (legacy BC)

## Error Conditions

| Error           | Trigger                                                 |
| --------------- | ------------------------------------------------------- |
| `TypeError`     | Non-function passed to `use()`/`unshift()`              |
| `Error`         | Duplicate middleware when `duplicatesCheckEnabled=true` |
| `TimeoutError`  | Middleware or total execution exceeds timeout           |
| `signal.reason` | AbortSignal fired before/between middlewares            |

## Important Implementation Notes

1. **Timeout wrapping preserves identity via `__midwareOriginal`**: Calling `use(fn, timeout)` wraps `fn` in a new function, but stores the original as `wrapped.__midwareOriginal`. `remove(fn)`, duplicate detection, and priority sorting all look through this back-reference, so they work correctly with timeout-wrapped middlewares.

2. **No sort caching**: Priority sort is re-evaluated on every `execute()`. Mutating `__midwarePreExecuteSortOrder` between runs is safe. Cost is O(n log n) per execute; negligible for typical stacks.

3. **Args normalization**: `execute()` wraps non-array args in array automatically. This is a documented legacy convenience; prefer always passing a tuple that matches `T`.

4. **Options are mutable**: `options` property is public and can be modified after construction. Since sorting is no longer cached, toggling `preExecuteSortEnabled` at runtime is safe.

5. **AbortSignal is cooperative, not coercive**: The signal check happens _between_ middlewares, not during. An in-flight middleware continues until it yields. Middlewares that want true cancellation must accept the signal through the shared context (via `args`) and check it themselves.

6. **`withTimeout(fn, 0)` is a no-op**: A non-positive timeout returns an async-wrapped pass-through. Previously fired on next tick (bug).

7. **Synchronous throws in `withTimeout`-wrapped `fn` become rejections**: Previously they escaped as sync throws.

8. **`SleepTimeoutRef.id` holds whatever `setTimeout` returns**: a number in browsers and Deno, a `Timeout` object on Node (the `number` type is a cast). `clearTimeout(ref.id)` works on all of them.

## Commands

```sh
pnpm install          # Dev tooling
pnpm test             # node --test (26 tests)
pnpm run test:watch   # Watch mode
pnpm run test:deno    # Same suite on Deno, as JSR consumers resolve it
pnpm run typecheck    # tsc --noEmit — the only type gate (Node strips types)
pnpm run lint         # biome check . (read-only)
pnpm run format       # biome check --write .
pnpm run ci           # typecheck + lint + test (what CI runs)
pnpm run build        # tsc -p tsconfig.build.json → dist/
pnpm run jsr:check    # deno publish --dry-run with the package.json version
pnpm run rp / rpm     # patch / minor release, npm + JSR before push (human action)
```

## Code Style

- Formatting: Biome (`biome.json`) — tabs, 4 wide, 90 columns, double quotes; manifests at 2 spaces
- Runtime policy: Node at the keyboard, npm as the registry. No `Deno.*` / `Bun.*`, no `jsr:` / `npm:` specifiers in source
- Erasable-only TS: no `enum` / `namespace` / parameter properties; `import type` for types; explicit `.ts` import extensions
- Private fields: `#` prefix
- Lint: `noExplicitAny` and `noNonNullAssertion` warn (Biome recommended); `useIterableCallbackReturn` warn-listed (constructor's `forEach`)

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

### Typed Return Value

```typescript
const app = new Midware<[Ctx], { status: number }>();
app.use((ctx) => {
    if (!ctx.user) return { status: 401 };
});
const result = await app.execute([ctx]);
// result: { status: number } | undefined
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

### AbortSignal Cancellation

```typescript
const ac = new AbortController();
setTimeout(() => ac.abort(), 1000);
await app.execute([ctx], { timeout: 5000, signal: ac.signal });
```

## Dependencies

None (zero external dependencies).

## Test Coverage

26 tests covering:

- Basic flow and early termination
- Error propagation (sync + async)
- Per-middleware timeout
- Total execution timeout
- Duplicate detection (incl. timeout-wrapped)
- Priority sorting (incl. timeout-wrapped, mid-run mutation)
- Remove/clear operations (incl. timeout-wrapped)
- `size` and `middlewares` getters
- Typed return (`R` generic)
- AbortSignal (pre-aborted, mid-chain, combined with timeout)
- `sleep` with AbortSignal
- `withTimeout` with `timeout <= 0` (no-op)
- `withTimeout` sync-throw handling
- `TimeoutError.name`

## Migration from v1.3.x

See the Changelog in [README.md](README.md) for the full list. Short version:

- **Runtime-BC-safe**: all documented runtime behaviors preserved. Legacy
  forms (`execute(args, number)`, `sleep(ms, { id })`, auto-array-wrap in
  `execute()`) still work.
- **Potential BC (edge cases)**:
  - `withTimeout(fn, 0)` is now a no-op (was: immediate `TimeoutError`).
  - `TimeoutError.name` is now `"TimeoutError"` (was: `"Error"`).
  - `withTimeout` type signature refined; rare type-only break if callers
    passed an opaque `CallableFunction`.
