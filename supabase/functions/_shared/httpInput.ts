import { isRecord } from "./contracts.ts";

export class HttpInputError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpInputError";
  }
}

/** Bound the bytes actually read, including requests without Content-Length. */
export async function readJsonObject(req: Request, maxBytes = 65_536): Promise<Record<string, unknown>> {
  if (req.method !== "POST") throw new HttpInputError(405, "Método não permitido");
  const type = req.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== "application/json") throw new HttpInputError(415, "Envie um corpo application/json");
  const declared = Number(req.headers.get("content-length"));
  if (declared > maxBytes) throw new HttpInputError(413, "Corpo da requisição excede o limite");
  if (!req.body) throw new HttpInputError(400, "Informe um objeto JSON válido");

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new HttpInputError(413, "Corpo da requisição excede o limite");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpInputError(400, "Informe um objeto JSON válido");
  }
  if (!isRecord(parsed)) throw new HttpInputError(400, "Informe um objeto JSON válido");
  return parsed;
}

export function inputErrorResponse(error: unknown, headers: Record<string, string>): Response | null {
  if (!(error instanceof HttpInputError)) return null;
  return new Response(JSON.stringify({ error: error.message }), {
    status: error.status,
    headers: {
      ...headers, "Content-Type": "application/json", "Cache-Control": "no-store",
      ...(error.status === 405 ? { Allow: "POST, OPTIONS" } : {}),
    },
  });
}
