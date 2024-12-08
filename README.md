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
import { Midware } from "@marianmeres/midware";
```

## Basic example

```ts
// generic type provided represents the middleware fn arguments
const app = new Midware<[{ foo: any }]>();

// Register middlewares via the `use` method. Pass in a non-zero timeout value to watch
// (and possibly reject) the middleware's execution duration.
app.use(async (context) => {
	// do the work here...
	context.foo = "bar";
	// To break the execution chain return anything other than `undefined`.
	// return true
}, timeout = 0);

// Now, execute all registered middlewares in series.
const context = { foo: null };
await app.execute(
	// call each middleware with these arguments
	[context],
	// Pass in a non-zero timeout value to watch (and possibly reject)
	// the overall execution duration.
	timeout = 0,
);

assert(context.foo === "bar");
```
