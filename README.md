# @marianmeres/midware

Minimalistic middleware framework.

[![JSR](https://jsr.io/badges/@<scope>/<package>)](https://jsr.io/@<scope>/<package>)

## Installation

deno
```bash
deno add jsr:@marianmeres/midware
```

nodejs
```bash
npx jsr add @marianmeres/midware
```

## Usage
```ts
import { Midware } from '@marianmeres/midware';

const app = new Midware<T>();

// Register middlewares via the `use` method. Pass in a timeout value to watch 
// the middleware's execution time.
app.use(async (context: T) => {
    // do the work here
}, timeout?);

// Now, execute all registered middlewares in series.
// If needed, break the execution by returning the `Midware.TERMINATE` 
// symbol from any of them. Pass in a timeout value to watch 
// the overall execution time.
const result = await app.execute({ some: 'context' }, timeout?);
```
