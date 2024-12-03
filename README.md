# @marianmeres/midware

Minimalistic middleware framework.

## Installation (deno)
```bash
deno add jsr:@marianmeres/midware
```

## Installation (nodejs)
```bash
npx jsr add @marianmeres/midware
```

## Usage
```ts
import { Midware } from '@marianmeres/midware';

const app = new Midware<T>();

// register middleware...
app.use((context: T) => {
    // do the work here
});

// now, execute all registered middlewares in series
// (break execution by returning `Midware.TERMINATE` symbol from any middleware)
const result = await app.execute({ some: 'context' });
```
