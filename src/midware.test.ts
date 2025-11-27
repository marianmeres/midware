// deno-lint-ignore-file no-explicit-any

import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { Midware, MidwareUseFn } from "./midware.ts";
import { sleep } from "./utils/sleep.ts";
import { TimeoutError } from "./utils/with-timeout.ts";

Deno.test("framework flow works", async () => {
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
	assertEquals({ foo: "bar", x: [1, 2], baz: "bat", counter: 2 }, context);
});

Deno.test("middleware can throw", async () => {
	class BoomError extends Error {}
	const app = new Midware([
		() => {
			throw new BoomError();
		},
	]);
	await assertRejects(() => app.execute([]), BoomError);
});

Deno.test("middleware execution rejects on timeout excess", async () => {
	const _sleepTimer = { id: -1 };
	const app = new Midware();
	app.use(() => sleep(40, _sleepTimer), 20);
	app.use(() => {});
	await assertRejects(() => app.execute([]), TimeoutError);
	clearTimeout(_sleepTimer.id);
});

Deno.test(
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

Deno.test("execute all rejects on timeout excess", async () => {
	const _sleepTimer = { id: -1 };
	const app = new Midware<any>();
	app.use(() => sleep(40, _sleepTimer));
	app.use(() => {});
	await assertRejects(() => app.execute({}, 20), TimeoutError);
	clearTimeout(_sleepTimer.id);
});

Deno.test("duplicates check", () => {
	const fn1 = () => null;
	const fn2 = () => null;

	// no check
	let app = new Midware<any>([fn1, fn2], { duplicatesCheckEnabled: false });
	app.use(fn1);
	app.use(fn2);

	// now check
	app = new Midware<any>([fn1, fn2], { duplicatesCheckEnabled: true });
	assertThrows(() => app.use(fn1));
	assertThrows(() => app.use(fn2));
	assertThrows(() => app.unshift(fn2));

	// now check again, but `withTimeout` makes it not detectable
	() => app.use(fn1, 1);
	() => app.use(fn2, 1);
	() => app.unshift(fn2, 1);

	// check at constructor
	assertThrows(
		() => new Midware<any>([fn1, fn1], { duplicatesCheckEnabled: true })
	);
});

Deno.test("pre execute sort order", async () => {
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
	assertEquals(context.log, [1, 2, 3, 4]);

	// now repeat, but modify sort order marks
	fn3.__midwarePreExecuteSortOrder = 1;
	fn4.__midwarePreExecuteSortOrder = 0;
	context = { log: [] };
	app = new Midware<[Context]>([fn1, fn2, fn3, fn4], {
		preExecuteSortEnabled: true,
	});
	await app.execute([context]);

	assertEquals(context.log, [4, 3, 1, 2]);
});

Deno.test("remove middleware", async () => {
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
	assertEquals(removed, true);

	const context = { log: [] };
	await app.execute([context]);
	assertEquals(context.log, [1, 3]);

	// Try to remove non-existent middleware
	const notRemoved = app.remove(fn2);
	assertEquals(notRemoved, false);
});

Deno.test("clear all middlewares", async () => {
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
	assertEquals(context.log, []);
});

Deno.test("remove invalidates sort cache", async () => {
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
	assertEquals(context.log, [3, 2, 1]);

	// Remove fn2 and verify cache is invalidated
	app.remove(fn2);

	context = { log: [] };
	await app.execute([context]);
	assertEquals(context.log, [3, 1]);
});

Deno.test("clear invalidates sort cache", async () => {
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
	assertEquals(context.log, [2, 1]);

	// Clear and add new middlewares
	app.clear();

	const fn3: MidwareUseFn<[Context]> = (ctx) => {
		ctx.log.push(3);
	};
	fn3.__midwarePreExecuteSortOrder = 1;

	app.use(fn3);

	context = { log: [] };
	await app.execute([context]);
	assertEquals(context.log, [3]);
});
