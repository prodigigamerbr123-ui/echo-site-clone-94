// Test-only bootstrap: native Deno.serve also stays on loopback.
const serve = Deno.serve;
Deno.serve = ((options: Deno.ServeOptions | Deno.ServeHandler, handler?: Deno.ServeHandler) => {
  if (typeof options === 'function') return serve({ hostname: '127.0.0.1', port: 8000, onListen: () => {} }, options);
  return serve({ ...options, hostname: '127.0.0.1', port: 8000, onListen: () => {} }, handler!);
}) as typeof Deno.serve;
const name = Deno.args[0];
if (!/^[a-z-]+$/.test(name)) throw new Error('Invalid handler name');
await import(new URL(`../functions/${name}/index.ts`, import.meta.url).href);
