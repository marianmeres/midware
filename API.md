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
new Midware<T extends unknown[]>(
  midwares?: MidwareUseFn<T>[],
  options?: MidwareOptions
)
```

Creates a new Midware instance.

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

// With typed arguments
const m4 = new Midware<[Request, Response]>();
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

Removes a specific middleware from the stack.

| Parameter | Type | Description |
|-----------|------|-------------|
| `midware` | `MidwareUseFn<T>` | The middleware function to remove (must be exact reference) |

**Returns:** `true` if the middleware was found and removed, `false` otherwise.

**Note:** If the middleware was registered with a timeout, it was wrapped in a new function, so you won't be able to remove it using the original function reference.

**Example:**

```ts
const myMiddleware = (ctx) => { /* ... */ };
midware.use(myMiddleware);

// Later...
midware.remove(myMiddleware); // returns true
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
execute(args: T, timeout?: number): Promise<unknown>
```

Executes all registered middlewares in series.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `args` | `T` | - | The arguments to pass to each middleware function |
| `timeout` | `number` | `0` | Optional total execution timeout in milliseconds |

**Returns:** A promise that resolves to:
- The return value of the terminating middleware (if any returned non-undefined)
- `undefined` if all middlewares completed without returning a value

**Throws:**
- `TimeoutError` - If the total execution time exceeds the specified timeout

**Execution behavior:**
1. Middlewares execute sequentially (in series, not parallel)
2. Each middleware receives the same `args` tuple
3. Returning `undefined` continues to the next middleware
4. Returning any other value terminates the chain and returns that value
5. If `preExecuteSortEnabled` is true, middlewares are sorted by `__midwarePreExecuteSortOrder` first

**Example:**

```ts
// Basic execution
const result = await midware.execute([request, response]);

// With total timeout (5 seconds)
const result = await midware.execute([ctx], 5000);

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
| `preExecuteSortEnabled` | `boolean` | `false` | When enabled, middlewares are sorted by `__midwarePreExecuteSortOrder` before execution. The sorted order is cached and only recalculated when the middleware stack changes. |
| `duplicatesCheckEnabled` | `boolean` | `false` | When enabled, throws an error if the same middleware function is added twice. Note: Middlewares wrapped with `withTimeout` create new function references, so duplicate detection won't work for those. |

**Example:**

```ts
const midware = new Midware([], {
  preExecuteSortEnabled: true,
  duplicatesCheckEnabled: true,
});
```

---

## Utility Functions

### withTimeout

```ts
function withTimeout<T>(
  fn: CallableFunction,
  timeout?: number,
  errMessage?: string
): (...args: any[]) => Promise<T>
```

Wraps a function with timeout protection. The returned function will reject with `TimeoutError` if execution exceeds the timeout.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fn` | `CallableFunction` | - | The function to wrap |
| `timeout` | `number` | `1000` | Maximum execution time in milliseconds |
| `errMessage` | `string` | `"Timed out after {timeout} ms"` | Custom error message |

**Returns:** A new function that returns a Promise which rejects with `TimeoutError` if timeout is exceeded.

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
  __timeout_ref__?: { id: number }
): Promise<void>
```

Promise-based delay utility for async/await flows.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `timeout` | `number` | - | The delay duration in milliseconds |
| `__timeout_ref__` | `{ id: number }` | `{ id: -1 }` | Optional object to store timer ID for external cancellation |

**Returns:** A promise that resolves after the specified delay.

**Example:**

```ts
import { sleep } from "@marianmeres/midware";

// Simple usage
await sleep(100);
console.log("100ms later");

// With timer reference for cancellation
const ref = { id: -1 };
const sleepPromise = sleep(5000, ref);

// Cancel the sleep early
clearTimeout(ref.id);
```

---

## Error Classes

### TimeoutError

```ts
class TimeoutError extends Error {}
```

Custom error thrown when a timeout occurs during function execution.

**Example:**

```ts
import { TimeoutError } from "@marianmeres/midware";

try {
  await withTimeout(slowFn, 100)();
} catch (e) {
  if (e instanceof TimeoutError) {
    console.log("Operation timed out");
  }
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
