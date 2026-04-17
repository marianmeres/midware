# API Reference

Complete API documentation for `@marianmeres/midware`.

## Table of Contents

- [Midware Class](#midware-class)
  - [Constructor](#constructor)
  - [Properties](#properties)
  - [Methods](#methods)
- [Types](#types)
  - [MidwareUseFn](#midwareusefn)
  - [MidwareOptions](#midwareoptions)
  - [MidwareExecuteOptions](#midwareexecuteoptions)
- [Utility Functions](#utility-functions)
  - [withTimeout](#withtimeout)
  - [sleep](#sleep)
- [Error Classes](#error-classes)
  - [TimeoutError](#timeouterror)

---

## Midware Class

The main middleware manager class for executing functions in series.

```ts
import { Midware } from "@marianmeres/midware";
```

### Constructor

```ts
new Midware<T extends unknown[], R = unknown>(
  midwares?: MidwareUseFn<T>[],
  options?: MidwareOptions
)
```

Creates a new Midware instance.

| Type param | Description |
|------------|-------------|
| `T` | Tuple type of arguments passed to every middleware |
| `R` | Return type of a terminating middleware (defaults to `unknown`) |

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `midwares` | `MidwareUseFn<T>[]` | `[]` | Initial array of middleware functions to register |
| `options` | `MidwareOptions` | `{}` | Configuration options |

**Example:**

```ts
// Empty instance
const m1 = new Midware();

// With initial middlewares
const m2 = new Midware([fn1, fn2]);

// With options
const m3 = new Midware([], { duplicatesCheckEnabled: true });

// With typed arguments and return value
const m4 = new Midware<[Request, Response], { status: number; body: string }>();
```

### Properties

#### `options`

```ts
options: MidwareOptions
```

The current configuration options. Can be modified after construction.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `preExecuteSortEnabled` | `boolean` | `false` | Sort middlewares by `__midwarePreExecuteSortOrder` before execution |
| `duplicatesCheckEnabled` | `boolean` | `false` | Throw error if the same middleware is added twice |

#### `size` *(getter)*

```ts
get size: number
```

The number of middlewares currently registered.

#### `middlewares` *(getter)*

```ts
get middlewares: readonly MidwareUseFn<T>[]
```

A read-only snapshot of registered middlewares, in insertion order, with any
timeout wrappers unwrapped so consumers see the original function references.
Mutating the returned array has no effect on the stack.

### Methods

#### `use()`

```ts
use(midware: MidwareUseFn<T>, timeout?: number): void
```

Registers a middleware function by pushing it to the end of the internal stack.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `midware` | `MidwareUseFn<T>` | - | The middleware function to register |
| `timeout` | `number` | `0` | Optional timeout in milliseconds. If positive, wraps with timeout protection |

**Throws:**
- `TypeError` - If `midware` is not a function
- `Error` - If `duplicatesCheckEnabled` is true and this middleware already exists

**Notes:**
Since v1.4, timeout-wrapped middlewares still preserve their identity for
`remove()`, duplicate detection, and priority sorting — you don't need to
keep a reference to the wrapper.

**Example:**

```ts
midware.use((ctx) => {
  ctx.processed = true;
});

// With per-middleware timeout (1 second)
midware.use(slowMiddleware, 1000);
```

---

#### `unshift()`

```ts
unshift(midware: MidwareUseFn<T>, timeout?: number): void
```

Registers a middleware function by inserting it at the beginning of the internal stack.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `midware` | `MidwareUseFn<T>` | - | The middleware function to register |
| `timeout` | `number` | `0` | Optional timeout in milliseconds |

**Throws:**
- `TypeError` - If `midware` is not a function
- `Error` - If `duplicatesCheckEnabled` is true and this middleware already exists

**Example:**

```ts
// Add a middleware that should run before all others
midware.unshift((ctx) => {
  ctx.startTime = Date.now();
});
```

---

#### `remove()`

```ts
remove(midware: MidwareUseFn<T>): boolean
```

Removes a specific middleware from the stack. Lookup is performed against the
original (unwrapped) reference, so this works for middlewares registered with
a per-middleware timeout.

| Parameter | Type | Description |
|-----------|------|-------------|
| `midware` | `MidwareUseFn<T>` | The middleware function to remove (the original reference) |

**Returns:** `true` if the middleware was found and removed, `false` otherwise.

**Example:**

```ts
const myMiddleware = (ctx) => { /* ... */ };
midware.use(myMiddleware, 1000); // registered with timeout

midware.remove(myMiddleware); // returns true (v1.4+)
midware.remove(myMiddleware); // returns false (already removed)
```

---

#### `clear()`

```ts
clear(): void
```

Removes all middlewares from the stack.

**Example:**

```ts
midware.use(fn1);
midware.use(fn2);
midware.clear();
// Stack is now empty
```

---

#### `execute()`

```ts
execute(
  args: T,
  timeoutOrOptions?: number | MidwareExecuteOptions,
): Promise<R | undefined>
```

Executes all registered middlewares in series.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `args` | `T` | - | The arguments to pass to each middleware function |
| `timeoutOrOptions` | `number \| MidwareExecuteOptions` | `0` | Either a total-execution timeout in ms (legacy form) or an options object |

**Returns:** A promise that resolves to:
- The return value of the terminating middleware (if any returned non-undefined), typed as `R`
- `undefined` if all middlewares completed without returning a value

**Throws:**
- `TimeoutError` - If the total execution time exceeds the specified timeout
- The `signal.reason` if the provided `AbortSignal` is aborted before or between middlewares

**Execution behavior:**
1. Middlewares execute sequentially (in series, not parallel)
2. Each middleware receives the same `args` tuple
3. Returning `undefined` continues to the next middleware
4. Returning any other value terminates the chain and returns that value
5. If `preExecuteSortEnabled` is true, middlewares are sorted by `__midwarePreExecuteSortOrder` on **every** `execute()` call (sort keys may be mutated between runs)
6. If an `AbortSignal` is provided, it is checked before each middleware; if aborted, the chain stops and the promise rejects with the signal's reason

**Legacy note:** If `args` is not an array it is auto-wrapped into a single-element array. Prefer always passing a tuple that matches `T`.

**Example:**

```ts
// Basic execution
const result = await midware.execute([request, response]);

// With total timeout (legacy form)
const result = await midware.execute([ctx], 5000);

// With options object (timeout + AbortSignal)
const ac = new AbortController();
setTimeout(() => ac.abort(new Error("user cancelled")), 100);
await midware.execute([ctx], { timeout: 5000, signal: ac.signal });

// Early termination
midware.use((ctx) => {
  if (!ctx.authorized) {
    return { error: "Forbidden" }; // stops execution, returns this value
  }
});
const result = await midware.execute([ctx]); // { error: "Forbidden" }
```

---

## Types

### MidwareUseFn

```ts
type MidwareUseFn<T extends unknown[]> = {
  (...args: T): any;
  __midwarePreExecuteSortOrder?: number;
  __midwareDuplicable?: boolean;
  __midwareOriginal?: MidwareUseFn<T>; // internal (v1.4+)
};
```

The middleware function type that can be registered with the Midware manager.

**Return behavior:**
- Returning `undefined` allows the execution chain to continue
- Returning any other value terminates the chain and returns that value

**Optional properties:**

| Property | Type | Description |
|----------|------|-------------|
| `__midwarePreExecuteSortOrder` | `number` | Priority for sorting. Lower numbers execute first. Middlewares without this property are sorted to the end (treated as `Infinity`). Only used when `preExecuteSortEnabled` is true. |
| `__midwareDuplicable` | `boolean` | When `true`, this middleware can be added multiple times without triggering a duplicate error (when `duplicatesCheckEnabled` is true). |
| `__midwareOriginal` | `MidwareUseFn<T>` | **Internal.** When the library wraps a middleware with per-middleware timeout, it stores the original reference here so `remove()`, duplicate detection, and sort-key lookups continue to work. You generally should not set this manually. |

**Example:**

```ts
// Simple logging middleware
const logger: MidwareUseFn<[Request, Response]> = (req, res) => {
  console.log(`${req.method} ${req.url}`);
  // returns undefined, so execution continues
};

// Middleware with priority
const authMiddleware: MidwareUseFn<[Request]> = (req) => {
  if (!req.headers.authorization) {
    return { error: "Unauthorized" }; // terminates execution
  }
};
authMiddleware.__midwarePreExecuteSortOrder = 1; // runs first
```

---

### MidwareOptions

```ts
interface MidwareOptions {
  preExecuteSortEnabled?: boolean;
  duplicatesCheckEnabled?: boolean;
}
```

Configuration options for the Midware manager.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `preExecuteSortEnabled` | `boolean` | `false` | Sort middlewares by `__midwarePreExecuteSortOrder` on every `execute()` call. Lower numbers execute first. |
| `duplicatesCheckEnabled` | `boolean` | `false` | Throw an error if the same middleware function is added twice. Works correctly for timeout-wrapped middlewares as of v1.4. |

**Example:**

```ts
const midware = new Midware([], {
  preExecuteSortEnabled: true,
  duplicatesCheckEnabled: true,
});
```

---

### MidwareExecuteOptions

```ts
interface MidwareExecuteOptions {
  timeout?: number;
  signal?: AbortSignal;
}
```

Options accepted by `Midware.execute()`.

| Property | Type | Description |
|----------|------|-------------|
| `timeout` | `number` | Total execution timeout in milliseconds. If positive, the entire chain must complete within this duration or a `TimeoutError` is thrown. Non-positive values mean "no timeout". |
| `signal` | `AbortSignal` | Cooperative cancellation signal. Checked before each middleware; if aborted, execution stops and the promise rejects with the signal's reason. In-flight middlewares are **not** forcefully cancelled. |

**Example:**

```ts
const ac = new AbortController();
setTimeout(() => ac.abort(), 1000);
await midware.execute([ctx], { timeout: 5000, signal: ac.signal });
```

---

## Utility Functions

### withTimeout

```ts
function withTimeout<
  TReturn = unknown,
  TArgs extends readonly unknown[] = any[],
>(
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
  timeout?: number,
  errMessage?: string,
): (...args: TArgs) => Promise<TReturn>
```

Wraps a function with timeout protection. The returned function returns a Promise that rejects with `TimeoutError` if execution exceeds the timeout.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fn` | `(...args: TArgs) => TReturn \| Promise<TReturn>` | - | The function to wrap |
| `timeout` | `number` | `1000` | Maximum execution time in milliseconds. **Non-positive values (<= 0) mean "no timeout"** — `fn` is still promise-wrapped for signature consistency, but no timer is scheduled. |
| `errMessage` | `string` | `"Timed out after {timeout} ms"` | Custom error message |

**Returns:** A new function that returns a Promise which rejects with `TimeoutError` if timeout is exceeded.

**Notes:**
- A synchronous throw inside `fn` is converted into a rejected Promise (consistent Promise-returning contract).
- The underlying operation is **not** cancelled when the timeout fires — JavaScript has no generic way to cancel arbitrary work. For true cancellation, use `AbortSignal` through your own `fn`.

**Example:**

```ts
import { withTimeout, TimeoutError } from "@marianmeres/midware";

const fetchWithTimeout = withTimeout(fetch, 5000, "Request timed out");

try {
  const response = await fetchWithTimeout("https://api.example.com/data");
} catch (e) {
  if (e instanceof TimeoutError) {
    console.log("Operation timed out");
  }
}
```

---

### sleep

```ts
function sleep(
  timeout: number,
  refOrSignal?: { id: number } | AbortSignal,
): Promise<void>
```

Promise-based delay utility for async/await flows.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `timeout` | `number` | - | The delay duration in milliseconds |
| `refOrSignal` | `{ id: number } \| AbortSignal` | `{ id: -1 }` | Either an `AbortSignal` (preferred) for cancellation, or a legacy `{ id }` ref object that will receive the timer id (so callers can `clearTimeout(ref.id)`). |

**Returns:** A promise that resolves after the specified delay. If an `AbortSignal` is provided and fires, the promise rejects with the signal's reason.

**Example:**

```ts
import { sleep } from "@marianmeres/midware";

// Simple usage
await sleep(100);

// AbortSignal cancellation (recommended)
const ac = new AbortController();
const promise = sleep(5000, ac.signal);
ac.abort(); // promise rejects

// Legacy: timer reference for external clearTimeout
const ref = { id: -1 };
const promise2 = sleep(5000, ref);
clearTimeout(ref.id); // promise resolves silently
```

---

## Error Classes

### TimeoutError

```ts
class TimeoutError extends Error {
  readonly name: "TimeoutError";
}
```

Custom error thrown when a timeout occurs during function execution. As of v1.4, `name` is correctly set to `"TimeoutError"` (was `"Error"` previously).

**Example:**

```ts
import { TimeoutError } from "@marianmeres/midware";

try {
  await withTimeout(slowFn, 100)();
} catch (e) {
  if (e instanceof TimeoutError) {
    console.log("Operation timed out");
  }
  // Both of these now work correctly:
  if (e?.name === "TimeoutError") { /* ... */ }
}
```

---

## Usage Patterns

### Request/Response Pipeline

```ts
const app = new Midware<[Request, Response]>();

app.use((req, res) => {
  console.log(`${req.method} ${req.url}`);
});

app.use((req, res) => {
  if (!req.headers.authorization) {
    return { status: 401, error: "Unauthorized" };
  }
});

app.use((req, res) => {
  res.body = "Hello World";
});

const result = await app.execute([request, response]);
```

### Context Object Pattern

```ts
interface Context {
  startTime?: number;
  user?: string;
  data?: any;
}

const app = new Midware<[Context]>();

app.use((ctx) => {
  ctx.startTime = Date.now();
});

app.use((ctx) => {
  ctx.user = "authenticated-user";
});

app.use((ctx) => {
  ctx.data = processData();
});

const ctx: Context = {};
await app.execute([ctx]);
```

### Priority-Based Execution

```ts
const app = new Midware<[string[]]>([], { preExecuteSortEnabled: true });

const logging: MidwareUseFn<[string[]]> = (log) => { log.push("logging"); };
logging.__midwarePreExecuteSortOrder = 100;

const auth: MidwareUseFn<[string[]]> = (log) => { log.push("auth"); };
auth.__midwarePreExecuteSortOrder = 1;

const validation: MidwareUseFn<[string[]]> = (log) => { log.push("validation"); };
validation.__midwarePreExecuteSortOrder = 10;

app.use(logging);    // Added first
app.use(auth);       // Added second
app.use(validation); // Added third

const log: string[] = [];
await app.execute([log]);
console.log(log); // ["auth", "validation", "logging"]
```

### Cancellable Pipeline

```ts
const app = new Midware<[{ log: string[] }]>();

app.use((ctx) => { ctx.log.push("a"); });
app.use(async (ctx) => {
  ctx.log.push("b");
  // cooperative: pass the signal through the context if your middleware
  // wants to abort in-flight work
  await sleep(1000);
});
app.use((ctx) => { ctx.log.push("c"); });

const ac = new AbortController();
setTimeout(() => ac.abort(new Error("user cancelled")), 100);

try {
  await app.execute([{ log: [] }], { signal: ac.signal });
} catch (err) {
  console.error(err); // Error: user cancelled
}
```
