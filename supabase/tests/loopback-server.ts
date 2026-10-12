// Test-only replacement: bind legacy std/http handlers exclusively to loopback.
export function serve(handler: Deno.ServeHandler): Deno.HttpServer<Deno.NetAddr> {
  return Deno.serve({ hostname: '127.0.0.1', port: 8000, onListen: () => {} }, handler);
}
