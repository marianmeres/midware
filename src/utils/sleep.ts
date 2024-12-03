/**
 * Deno.test is quite strict and reports every non-cleared timeout... so we have to
 * be able to pass in some object ref if needed (eg when sleep is not resolved via Promise.race)
 * to be able to do the clearing eventually.
 * If calling directly `await sleep(x)` in a top level flow, the dance is not needed.
 *
 * @example
 *
 * ```ts
 * // Usage with ref:
 * let ref = { id: -1 };
 * some(() => sleep(100, ref))
 * // ...
 * clearTimeout(ref.id)
 * ```
 */
export function sleep(ms: number, __timeout__: { id: number } = { id: -1 }) {
	return new Promise((resolve) => {
		__timeout__.id = setTimeout(() => {
			clearTimeout(__timeout__.id);
			resolve(undefined);
		}, ms);
	});
}
