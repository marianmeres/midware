# @marianmeres/midware

A minimalistic, type-safe middleware framework for executing functions in series.

[![JSR](https://jsr.io/badges/@marianmeres/midware)](https://jsr.io/@marianmeres/midware)
[![NPM](https://img.shields.io/npm/v/@marianmeres/midware)](https://www.npmjs.com/package/@marianmeres/midware)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Type-safe**: Full TypeScript support with generic middleware arguments and return type
- **Timeout protection**: Per-middleware and total execution timeouts
- **Priority sorting**: Optional execution order based on middleware priority (re-evaluated on every run)
- **Duplicate detection**: Optional prevention of duplicate middleware registration (works even with per-middleware timeouts)
- **Cooperative cancellation**: Native `AbortSignal` support in `execute()` and `sleep()`
- **Early termination**: Any middleware can stop the chain by returning a non-undefined value
- **Inspection**: `size` and `middlewares` getters for debugging
- **Zero dependencies**: Lightweight and self-contained

## Installation

```sh
# Deno
deno add jsr:@marianmeres/midware
```

```sh
# Node.js
npx jsr add @marianmeres/midware
```

## Quick Start

```ts
import { Midware } from "@marianmeres/midware";

// Create a middleware manager with typed arguments
const app = new Midware<[{ user?: string; authorized?: boolean }]>();

// Register middlewares
app.use((ctx) => {
    ctx.user = "john";
});

app.use((ctx) => {
    ctx.authorized = true;
});

// Execute all middlewares in series
const ctx = {};
await app.execute([ctx]);

console.log(ctx); // { user: "john", authorized: true }
```

## API

### `Midware<T, R>`

The main middleware manager class.

- `T` — tuple type representing the arguments passed to all middlewares
- `R` — terminating-middleware return value type (defaults to `unknown`)

| Member | Description |
|--------|-------------|
| `use(midware, timeout?)` | Add middleware to the end of the stack |
| `unshift(midware, timeout?)` | Add middleware to the beginning of the stack |
| `remove(midware)` | Remove a specific middleware (returns `true` if found). Works with timeout-wrapped middlewares via the original reference. |
| `clear()` | Remove all middlewares |
| `execute(args, timeoutOrOptions?)` | Execute all middlewares in series |
| `size` *(getter)* | Number of registered middlewares |
| `middlewares` *(getter)* | Read-only snapshot of registered middlewares (originals, unwrapped) |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `preExecuteSortEnabled` | `boolean` | `false` | Sort middlewares by `__midwarePreExecuteSortOrder` before execution (re-evaluated on every `execute()` call) |
| `duplicatesCheckEnabled` | `boolean` | `false` | Throw error if the same middleware is added twice |

### Execute options

`execute(args, options)` accepts either a `number` (total timeout in ms, legacy form) or a `MidwareExecuteOptions`:

```ts
interface MidwareExecuteOptions {
    timeout?: number;       // total execution timeout (ms)
    signal?: AbortSignal;   // cooperative cancellation
}
```

### Utilities

- `withTimeout(fn, timeout?, errMessage?)` — Wraps a function with timeout protection. A non-positive `timeout` is a no-op.
- `sleep(timeout, refOrSignal?)` — Promise-based delay. Accepts either a legacy `{ id: number }` ref or an `AbortSignal`.
- `TimeoutError` — Custom error class for timeouts (name is `"TimeoutError"`).

For complete API documentation with detailed parameters, return types, and examples, see [API.md](API.md).

## Examples

### Early Termination

```ts
const app = new Midware<[{ authorized: boolean }]>();

app.use((ctx) => {
    if (!ctx.authorized) {
        return { error: "Forbidden" }; // Stops execution chain
    }
});

app.use((ctx) => {
    console.log("This won't run if unauthorized");
});

const result = await app.execute([{ authorized: false }]);
console.log(result); // { error: "Forbidden" }
```

### Typed Return Value

```ts
// Second generic is the return type of the terminating middleware
const app = new Midware<[{ user?: string }], { status: number }>();

app.use((ctx) => {
    if (!ctx.user) return { status: 401 };
});

const result = await app.execute([{}]);
// result is typed as { status: number } | undefined
```

### Timeout Protection

```ts
const app = new Midware<[any]>();

// Per-middleware timeout (1 second)
app.use(async (ctx) => {
    await someSlowOperation();
}, 1000);

// Total execution timeout (5 seconds) — legacy form
try {
    await app.execute([{}], 5000);
} catch (e) {
    if (e instanceof TimeoutError) {
        console.log("Operation timed out");
    }
}
```

### AbortSignal (cooperative cancellation)

```ts
const app = new Midware<[{ log: string[] }]>();

app.use((ctx) => { ctx.log.push("a"); });
app.use(async (ctx) => {
    ctx.log.push("b");
    await sleep(1000);
});
app.use((ctx) => { ctx.log.push("c"); }); // skipped after abort

const ac = new AbortController();
setTimeout(() => ac.abort(new Error("user cancelled")), 100);

try {
    await app.execute([{ log: [] }], { signal: ac.signal, timeout: 5000 });
} catch (err) {
    console.error(err); // "user cancelled"
}
```

### Priority Sorting

```ts
const app = new Midware<[string[]]>([], { preExecuteSortEnabled: true });

const logger: MidwareUseFn<[string[]]> = (log) => { log.push("logger"); };
logger.__midwarePreExecuteSortOrder = 10;

const auth: MidwareUseFn<[string[]]> = (log) => { log.push("auth"); };
auth.__midwarePreExecuteSortOrder = 1;

app.use(logger); // Added first
app.use(auth);   // Added second, but runs first due to lower sort order

const log: string[] = [];
await app.execute([log]);
console.log(log); // ["auth", "logger"]

// Sort order is re-evaluated on every execute() — mutating it between runs
// is honored (prior to v1.4, this was cached incorrectly).
auth.__midwarePreExecuteSortOrder = 99;
const log2: string[] = [];
await app.execute([log2]);
console.log(log2); // ["logger", "auth"]
```

### Duplicate Prevention

```ts
const app = new Midware<[any]>([], { duplicatesCheckEnabled: true });

const middleware = (ctx) => { /* ... */ };

app.use(middleware);
app.use(middleware); // Throws Error

// Duplicate detection also works correctly for middlewares registered
// with a per-middleware timeout (v1.4+):
app.use(otherFn, 100);
app.use(otherFn, 200); // also throws

// Allow duplicates for specific middleware
const duplicable = (ctx) => { /* ... */ };
duplicable.__midwareDuplicable = true;
app.use(duplicable);
app.use(duplicable); // OK
```

### Dynamic Middleware Management

```ts
const app = new Midware<[any]>();

const tempMiddleware = (ctx) => { ctx.temp = true; };

app.use(tempMiddleware, 1000); // wrapped with timeout
// remove() still works via the original reference (v1.4+)
app.remove(tempMiddleware); // returns true

// Inspect the stack
console.log(app.size);        // 0
console.log(app.middlewares); // readonly array of originals

// Or clear everything
app.clear();
```

## Changelog

### v1.4.0

Mostly backwards-compatible. See [CHANGELOG highlights](#changelog-highlights) below for any
potential breakage.

**New features**

- `execute(args, options)` — accepts `{ timeout, signal }` for `AbortSignal`-based cooperative cancellation in addition to the legacy `number` form.
- `sleep(ms, signal)` — accepts an `AbortSignal` for cancellation.
- `Midware<T, R>` — second generic parameter for the return type of `execute()`.
- `size` getter — number of registered middlewares.
- `middlewares` getter — read-only snapshot of originals (unwrapped).

**Bug fixes**

- **Priority sort is now re-evaluated on every `execute()`** — mutating `__midwarePreExecuteSortOrder` between runs is now honored (was silently cached).
- **`remove()` works for middlewares registered with a per-middleware timeout** — previously the timeout wrapper replaced the reference, breaking removal.
- **Duplicate detection works for timeout-wrapped middlewares** — same root cause as `remove()` above.
- **Priority sorting reads original metadata for timeout-wrapped middlewares** — previously the sort key was lost through the wrapper.
- **`withTimeout(fn, 0)` is now a no-op** — previously it fired immediately on the next tick (`setTimeout(..., 0)`).
- **`TimeoutError.name` is now `"TimeoutError"`** — previously it was `"Error"` (broke name-based checks in logs/monitors).
- **`withTimeout` — synchronous throws inside `fn` are converted to rejections** — previously they escaped as sync throws, inconsistent with the Promise-returning contract.

### Changelog highlights — potential BC notes

None of the changes affect runtime behavior for code that used the package as documented. The notes below capture edge cases and type-level changes.

1. **`withTimeout(fn, 0)` semantics changed.** Old behavior was a latent bug (it rejected with `TimeoutError` on the next tick). If any caller relied on that behavior, they must now pass a positive number. Negative timeouts are also treated as "no timeout" (previously a latent bug — negative delays behaved like `0`).

2. **`withTimeout` type signature refined.** Old: `withTimeout<T>(fn: CallableFunction, ...)`. New: `withTimeout<TReturn = unknown, TArgs extends readonly unknown[] = any[]>(fn: (...args: TArgs) => TReturn | Promise<TReturn>, ...)`. The legacy single-generic `withTimeout<string>(fn)` still works (first generic is still the return type). Passing a `CallableFunction` without a callable signature (very rare) may now fail at the type level.

3. **`TimeoutError.name` changed from `"Error"` to `"TimeoutError"`.** This is a fix, but any code relying on `err.name === "Error"` for a `TimeoutError` would break. `instanceof TimeoutError` is unaffected.

4. **Priority sort cache removed.** The `#sortedMidwares` / `#isDirty` private fields no longer exist. Since they were private, this is only relevant if you were monkey-patching internals.

5. **Wrapped middlewares now carry `__midwareOriginal`.** New property on the stored wrapper function. Existing code that treats `MidwareUseFn` as opaque is unaffected.

6. **Version bump: 1.3.x → 1.4.0.** Recommend a minor bump via lockfiles.

### Behavior explicitly preserved

- `execute(nonArray, timeout)` still auto-wraps `nonArray` into a single-element array (legacy convenience). Prefer always passing a tuple.
- `execute(args, number)` second-arg form still works alongside the new options-object form.
- `sleep(ms, { id })` legacy cancellation via `clearTimeout(ref.id)` still works.
- All public method names, option names, and metadata property names are unchanged.

## License

MIT
