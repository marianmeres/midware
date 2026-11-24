import assert from "node:assert/strict";
import { test } from "node:test";
import { Midware, type MidwareUseFn } from "../src/midware.ts";
import { sleep } from "../src/utils/sleep.ts";
import { TimeoutError, withTimeout } from "../src/utils/with-timeout.ts";

test("framework flow works", async () => {
	type Context = { foo: string; x: number[]; counter: number; baz?: string };
	const app = new Midware<[Context]>([
		(ctx) => {
			ctx.x.push(1);
			ctx.counter++;
		},
		async (ctx) => {
			await Promise.resolve(ctx.x.push(2));
		},
		(ctx) => {
			// still can write context even if terminating early
			ctx.baz = "bat";
			ctx.counter++;
			// by returning anything other than `undefined` we are breaking the chain
			return true;
		},
		// must NOT be reached
		(ctx) => {
			ctx.x.push(3);
			ctx.counter++;
		},
	]);
	const context: Context = { foo: "bar", x: [], counter: 0 };
	await app.execute([context]);
	// console.log(context);
	assert.deepStrictEqual({ foo: "bar", x: [1, 2], baz: "bat", counter: 2 }, context);
});

test("middleware can throw", async () => {
	class BoomError extends Error {}
	const app = new Midware([
		() => {
			throw new BoomError();
		},
	]);
	await assert.rejects(() => app.execute([]), BoomError);
});

test("middleware execution rejects on timeout excess", async () => {
	const _sleepTimer = { id: -1 };
	const app = new Midware();
	app.use(() => sleep(40, _sleepTimer), 20);
	app.use(() => {});
	await assert.rejects(() => app.execute([]), TimeoutError);
	clearTimeout(_sleepTimer.id);
});

test(
	"middleware execution does not reject if within timeout",
	async () => {
		const _sleepTimer = { id: -1 };
		const app = new Midware();
		app.use(() => sleep(20, _sleepTimer), 40);
		app.use(() => {});
		await app.execute([]);
		clearTimeout(_sleepTimer.id);
	}
);

test("execute all rejects on timeout excess", async () => {
	const _sleepTimer = { id: -1 };
	const app = new Midware<any>();
	app.use(() => sleep(40, _sleepTimer));
	app.use(() => {});
	await assert.rejects(() => app.execute({}, 20), TimeoutError);
	clearTimeout(_sleepTimer.id);
});

test("duplicates check", () => {
	const fn1 = () => null;
	const fn2 = () => null;

	// no check
	let app = new Midware<any>([fn1, fn2], { duplicatesCheckEnabled: false });
	app.use(fn1);
	app.use(fn2);

	// now check
	app = new Midware<any>([fn1, fn2], { duplicatesCheckEnabled: true });
	assert.throws(() => app.use(fn1));
	assert.throws(() => app.use(fn2));
	assert.throws(() => app.unshift(fn2));

	// now check again, but `withTimeout` makes it not detectable
	() => app.use(fn1, 1);
	() => app.use(fn2, 1);
	() => app.unshift(fn2, 1);

	// check at constructor
	assert.throws(
		() => new Midware<any>([fn1, fn1], { duplicatesCheckEnabled: true })
	);
});

test("pre execute sort order", async () => {
	type Context = { log: number[] };

	const fn1: MidwareUseFn<[Context]> = (ctx) => {
		ctx.log.push(1);
	};
	const fn2: MidwareUseFn<[Context]> = (ctx) => {
		ctx.log.push(2);
	};
	const fn3: MidwareUseFn<[Context]> = (ctx) => {
		ctx.log.push(3);
	};
	const fn4: MidwareUseFn<[Context]> = (ctx) => {
		ctx.log.push(4);
	};

	let context = { log: [] };
	let app = new Midware<[Context]>([fn1, fn2, fn3, fn4]);
	await app.execute([context]);
	assert.deepStrictEqual(context.log, [1, 2, 3, 4]);

	// now repeat, but modify sort order marks
	fn3.__midwarePreExecuteSortOrder = 1;
	fn4.__midwarePreExecuteSortOrder = 0;
	context = { log: [] };
	app = new Midware<[Context]>([fn1, fn2, fn3, fn4], {
		preExecuteSortEnabled: true,
	});
	await app.execute([context]);

	assert.deepStrictEqual(context.log, [4, 3, 1, 2]);
});

test("remove middleware", async () => {
	type Context = { log: number[] };
	const fn1: MidwareUseFn<[Context]> = (ctx) => {
		ctx.log.push(1);
	};
	const fn2: MidwareUseFn<[Context]> = (ctx) => {
		ctx.log.push(2);
	};
	const fn3: MidwareUseFn<[Context]> = (ctx) => {
		ctx.log.push(3);
	};

	const app = new Midware<[Context]>([fn1, fn2, fn3]);

	// Remove middleware from the middle
	const removed = app.remove(fn2);
	assert.deepStrictEqual(removed, true);

	const context = { log: [] };
	await app.execute([context]);
	assert.deepStrictEqual(context.log, [1, 3]);

	// Try to remove non-existent middleware
	const notRemoved = app.remove(fn2);
	assert.deepStrictEqual(notRemoved, false);
});

test("clear all middlewares", async () => {
	type Context = { log: number[] };
	const fn1: MidwareUseFn<[Context]> = (ctx) => {
		ctx.log.push(1);
	};
	const fn2: MidwareUseFn<[Context]> = (ctx) => {
		ctx.log.push(2);
	};

	const app = new Midware<[Context]>([fn1, fn2]);

	// Clear all middlewares
	app.clear();

	const context = { log: [] };
	await app.execute([context]);
	assert.deepStrictEqual(context.log, []);
});

test("remove invalidates sort cache", async () => {
	type Context = { log: number[] };

	const fn1: MidwareUseFn<[Context]> = (ctx) => {
		ctx.log.push(1);
	};
	const fn2: MidwareUseFn<[Context]> = (ctx) => {
		ctx.log.push(2);
	};
	const fn3: MidwareUseFn<[Context]> = (ctx) => {
		ctx.log.push(3);
	};

	fn1.__midwarePreExecuteSortOrder = 3;
	fn2.__midwarePreExecuteSortOrder = 2;
	fn3.__midwarePreExecuteSortOrder = 1;

	const app = new Midware<[Context]>([fn1, fn2, fn3], {
		preExecuteSortEnabled: true,
	});

	let context = { log: [] };
	await app.execute([context]);
	assert.deepStrictEqual(context.log, [3, 2, 1]);

	// Remove fn2 and verify cache is invalidated
	app.remove(fn2);

	context = { log: [] };
	await app.execute([context]);
	assert.deepStrictEqual(context.log, [3, 1]);
});

test("clear invalidates sort cache", async () => {
	type Context = { log: number[] };

	const fn1: MidwareUseFn<[Context]> = (ctx) => {
		ctx.log.push(1);
	};
	const fn2: MidwareUseFn<[Context]> = (ctx) => {
		ctx.log.push(2);
	};

	fn1.__midwarePreExecuteSortOrder = 2;
	fn2.__midwarePreExecuteSortOrder = 1;

	const app = new Midware<[Context]>([fn1, fn2], {
		preExecuteSortEnabled: true,
	});

	let context = { log: [] };
	await app.execute([context]);
	assert.deepStrictEqual(context.log, [2, 1]);

	// Clear and add new middlewares
	app.clear();

	const fn3: MidwareUseFn<[Context]> = (ctx) => {
		ctx.log.push(3);
	};
	fn3.__midwarePreExecuteSortOrder = 1;

	app.use(fn3);

	context = { log: [] };
	await app.execute([context]);
	assert.deepStrictEqual(context.log, [3]);
});

// ---------- Bug fixes (v1.4) ----------

test("B1: mutating sort order between executes is respected", async () => {
	type Context = { log: number[] };
	const fn1: MidwareUseFn<[Context]> = (ctx) => void ctx.log.push(1);
	const fn2: MidwareUseFn<[Context]> = (ctx) => void ctx.log.push(2);

	fn1.__midwarePreExecuteSortOrder = 1;
	fn2.__midwarePreExecuteSortOrder = 2;

	const app = new Midware<[Context]>([fn1, fn2], {
		preExecuteSortEnabled: true,
	});

	let context = { log: [] as number[] };
	await app.execute([context]);
	assert.deepStrictEqual(context.log, [1, 2]);

	// Flip priorities AFTER first execute — the old cache-invalidation
	// logic missed this case.
	fn1.__midwarePreExecuteSortOrder = 99;
	fn2.__midwarePreExecuteSortOrder = 0;

	context = { log: [] };
	await app.execute([context]);
	assert.deepStrictEqual(context.log, [2, 1]);
});

test("B2: withTimeout with timeout <= 0 is a no-op", async () => {
	const fn = () => "ok";

	// 0 must NOT reject (previously fired on next tick)
	assert.deepStrictEqual(await withTimeout(fn, 0)(), "ok");
	assert.deepStrictEqual(await withTimeout(fn, -1)(), "ok");

	// sleep longer than "the old default" — still no timeout with 0
	const slow = async () => {
		await sleep(30);
		return "slow-ok";
	};
	assert.deepStrictEqual(await withTimeout(slow, 0)(), "slow-ok");
});

test("B3: TimeoutError has proper name", () => {
	const err = new TimeoutError("boom");
	assert.deepStrictEqual(err.name, "TimeoutError");
	assert.deepStrictEqual(err instanceof Error, true);
	assert.deepStrictEqual(err instanceof TimeoutError, true);
});

test("B3b: withTimeout synchronous throw converts to rejection", async () => {
	class BoomError extends Error {}
	const boom = () => {
		throw new BoomError();
	};
	await assert.rejects(() => withTimeout(boom, 100)(), BoomError);
});

test("D1: remove works for middlewares registered with a timeout", () => {
	const app = new Midware<[{ x: number }]>();
	const fn: MidwareUseFn<[{ x: number }]> = (ctx) => {
		ctx.x++;
	};

	app.use(fn, 100);
	assert.deepStrictEqual(app.size, 1);
	assert.deepStrictEqual(app.remove(fn), true);
	assert.deepStrictEqual(app.size, 0);
	assert.deepStrictEqual(app.remove(fn), false);
});

test("D1: duplicate detection works with timeout-wrapped middlewares", () => {
	const fn = () => {};
	const app = new Midware<[]>([], { duplicatesCheckEnabled: true });

	app.use(fn, 100);
	assert.throws(() => app.use(fn, 100)); // same fn, different timeout
	assert.throws(() => app.use(fn)); // same fn, no timeout
	assert.throws(() => app.unshift(fn, 50));
});

test("D1: priority sorting works with timeout-wrapped middlewares", async () => {
	type Ctx = { log: number[] };
	const a: MidwareUseFn<[Ctx]> = (c) => void c.log.push(1);
	const b: MidwareUseFn<[Ctx]> = (c) => void c.log.push(2);
	const c: MidwareUseFn<[Ctx]> = (c2) => void c2.log.push(3);

	a.__midwarePreExecuteSortOrder = 3;
	b.__midwarePreExecuteSortOrder = 1;
	c.__midwarePreExecuteSortOrder = 2;

	const app = new Midware<[Ctx]>([], { preExecuteSortEnabled: true });
	app.use(a, 100); // wrapped
	app.use(b); // unwrapped
	app.use(c, 100); // wrapped

	const ctx = { log: [] as number[] };
	await app.execute([ctx]);
	assert.deepStrictEqual(ctx.log, [2, 3, 1]);
});

test("D6: size and middlewares getters", () => {
	const fn1 = () => {};
	const fn2 = () => {};

	const app = new Midware<[]>([fn1]);
	assert.deepStrictEqual(app.size, 1);
	assert.deepStrictEqual(app.middlewares.length, 1);
	assert.strictEqual(app.middlewares[0], fn1);

	app.use(fn2, 100); // timeout-wrapped
	assert.deepStrictEqual(app.size, 2);
	// middlewares getter returns the unwrapped originals
	assert.strictEqual(app.middlewares[1], fn2);

	// mutating the returned array must not affect internal state
	(app.middlewares as MidwareUseFn<[]>[]).push(() => {});
	assert.deepStrictEqual(app.size, 2);
});

test("D2: execute() return type respects R generic", async () => {
	const app = new Midware<[{ ok: boolean }], string>();
	app.use((ctx) => (ctx.ok ? "hit" : undefined));
	const result: string | undefined = await app.execute([{ ok: true }]);
	assert.deepStrictEqual(result, "hit");
});

test("S1: execute respects AbortSignal (already aborted)", async () => {
	const app = new Midware<[]>();
	let ran = false;
	app.use(() => {
		ran = true;
	});

	const ac = new AbortController();
	ac.abort(new Error("nope"));
	await assert.rejects(
		() => app.execute([], { signal: ac.signal }),
		(e: unknown) => e instanceof Error && e.message.includes("nope"),
	);
	assert.deepStrictEqual(ran, false);
});

test("S1: execute respects AbortSignal mid-chain", async () => {
	const app = new Midware<[{ log: string[] }]>();
	const ac = new AbortController();

	app.use((ctx) => {
		ctx.log.push("a");
	});
	app.use((ctx) => {
		ctx.log.push("b");
		ac.abort(new Error("stop"));
	});
	app.use((ctx) => {
		ctx.log.push("c"); // must not run
	});

	const ctx = { log: [] as string[] };
	await assert.rejects(
		() => app.execute([ctx], { signal: ac.signal }),
		(e: unknown) => e instanceof Error && e.message.includes("stop"),
	);
	assert.deepStrictEqual(ctx.log, ["a", "b"]);
});

test("S1: execute options can combine timeout + signal", async () => {
	const _timer = { id: -1 };
	const app = new Midware<[]>();
	app.use(() => sleep(50, _timer));
	const ac = new AbortController();

	await assert.rejects(
		() => app.execute([], { timeout: 20, signal: ac.signal }),
		TimeoutError,
	);
	clearTimeout(_timer.id);
});

test("S1: sleep respects AbortSignal", async () => {
	const ac = new AbortController();
	const promise = sleep(1000, ac.signal);
	ac.abort(new Error("cancelled"));
	await assert.rejects(
		() => promise,
		(e: unknown) => e instanceof Error && e.message.includes("cancelled"),
	);
});

test("S1: sleep pre-aborted signal rejects immediately", async () => {
	const ac = new AbortController();
	ac.abort(new Error("pre"));
	await assert.rejects(
		() => sleep(100, ac.signal),
		(e: unknown) => e instanceof Error && e.message.includes("pre"),
	);
});

test("BC: execute still accepts number as second arg", async () => {
	const _timer = { id: -1 };
	const app = new Midware<[]>();
	app.use(() => sleep(40, _timer));
	await assert.rejects(() => app.execute([], 20), TimeoutError);
	clearTimeout(_timer.id);
});
