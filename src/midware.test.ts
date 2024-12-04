// deno-lint-ignore-file no-explicit-any

import { assertEquals, assertRejects } from "@std/assert";
import { Midware } from "./midware.ts";
import { sleep } from "./utils/sleep.ts";
import { TimeoutError } from "./utils/with-timeout.ts";

Deno.test("framework flow works", async () => {
	const app = new Midware<any>([
		(ctx: any) => {
			ctx.x.push(1);
			ctx.counter++;
		},
		async (ctx: any) => {
			await Promise.resolve(ctx.x.push(2));
		},
		(ctx: any) => {
			// still can write context even if terminating early
			ctx.baz = "bat";
			ctx.counter++;
			// by returning anything other than `undefined` we are breaking the chain
			return true;
		},
		// must NOT be reached
		(ctx: any) => {
			ctx.x.push(3);
			ctx.counter++;
		},
	]);
	const context: any = { foo: "bar", x: [], counter: 0 };
	await app.execute(context);
	// console.log(context);
	assertEquals({ foo: "bar", x: [1, 2], baz: "bat", counter: 2 }, context);
});

Deno.test("middleware can throw", async () => {
	class BoomError extends Error {}
	const app = new Midware<any>([
		() => {
			throw new BoomError();
		},
	]);
	await assertRejects(() => app.execute({}), BoomError);
});

Deno.test("middleware execution rejects on timeout excess", async () => {
	const _sleepTimer = { id: -1 };
	const app = new Midware<any>();
	app.use(() => sleep(40, _sleepTimer), 20);
	app.use(() => {});
	await assertRejects(() => app.execute({}), TimeoutError);
	clearTimeout(_sleepTimer.id);
});

Deno.test(
	"middleware execution does not reject if within timeout",
	async () => {
		const _sleepTimer = { id: -1 };
		const app = new Midware<any>();
		app.use(() => sleep(20, _sleepTimer), 40);
		app.use(() => {});
		await app.execute({});
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
