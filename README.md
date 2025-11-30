# @marianmeres/midware

A minimalistic, type-safe middleware framework for executing functions in series.

[![JSR](https://jsr.io/badges/@marianmeres/midware)](https://jsr.io/@marianmeres/midware)

## Features

- **Type-safe**: Full TypeScript support with generic middleware arguments
- **Timeout protection**: Per-middleware and total execution timeouts
- **Priority sorting**: Optional execution order based on middleware priority
- **Duplicate detection**: Optional prevention of duplicate middleware registration
- **Early termination**: Any middleware can stop the chain by returning a non-undefined value
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

### `Midware<T>`

The main middleware manager class. `T` is a tuple type representing the arguments passed to all middlewares.

#### Constructor

```ts
new Midware<T>(midwares?: MidwareUseFn<T>[], options?: MidwareOptions)
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `preExecuteSortEnabled` | `boolean` | `false` | Sort middlewares by `__midwarePreExecuteSortOrder` before execution |
| `duplicatesCheckEnabled` | `boolean` | `false` | Throw error if the same middleware is added twice |

#### Methods

| Method | Description |
|--------|-------------|
| `use(midware, timeout?)` | Add middleware to the end of the stack |
| `unshift(midware, timeout?)` | Add middleware to the beginning of the stack |
| `remove(midware)` | Remove a specific middleware (returns `true` if found) |
| `clear()` | Remove all middlewares |
| `execute(args, timeout?)` | Execute all middlewares in series |

### `MidwareUseFn<T>`

The middleware function type. Can have optional properties:

- `__midwarePreExecuteSortOrder?: number` - Priority for sorting (lower = first)
- `__midwareDuplicable?: boolean` - Allow this middleware to be added multiple times

### Utility Functions

#### `withTimeout<T>(fn, timeout, errMessage?)`

Wraps a function with timeout protection. Throws `TimeoutError` if execution exceeds the timeout.

#### `sleep(timeout, ref?)`

Promise-based delay utility.

#### `TimeoutError`

Custom error class thrown when timeouts are exceeded.

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

### Timeout Protection

```ts
const app = new Midware<[any]>();

// Per-middleware timeout (1 second)
app.use(async (ctx) => {
    await someSlowOperation();
}, 1000);

// Total execution timeout (5 seconds)
try {
    await app.execute([{}], 5000);
} catch (e) {
    if (e instanceof TimeoutError) {
        console.log("Operation timed out");
    }
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
```

### Duplicate Prevention

```ts
const app = new Midware<[any]>([], { duplicatesCheckEnabled: true });

const middleware = (ctx) => { /* ... */ };

app.use(middleware);
app.use(middleware); // Throws Error: "Midware already exist..."

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

app.use(tempMiddleware);
// ... later
app.remove(tempMiddleware); // Returns true

// Or clear everything
app.clear();
```

## License

MIT
