# @marianmeres/midware

Minimalistic middleware framework.

[![JSR](https://jsr.io/badges/@marianmeres/midware)](https://jsr.io/@marianmeres/midware)

## Installation

deno
```sh
deno add jsr:@marianmeres/midware
```

nodejs
```sh
npx jsr add @marianmeres/midware
```

## Usage

```ts
import { Midware } from '@marianmeres/midware';
```

## Basic example
```ts
const app = new Midware<T>();

// Register middlewares via the `use` method. Pass in a non-zero timeout value to watch 
// (and possibly reject) the middleware's execution duration.
app.use(async (context: T) => {
    // do the work here...
    context.foo = 'bar';
    // To break the execution chain return the `Midware.TERMINATE` symbol.
    // If so, no other middleware will execute after this one.
    // return Midware.TERMINATE;
}, timeout = 0);

// Now, execute all registered middlewares in series.
// Pass in a non-zero timeout value to watch (and possibly reject)
// the overall execution duration.
const result = await app.execute({ foo: null }, timeout = 0);

// `result` is the context
assert(result.foo === 'bar');
```
