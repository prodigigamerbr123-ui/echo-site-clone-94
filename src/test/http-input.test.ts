// @vitest-environment node
import { describe, expect, it } from "vitest";
import { inputErrorResponse, readJsonObject } from "../../supabase/functions/_shared/httpInput";

const request = (body: string, type = "application/json") => new Request("http://localhost", {
  method: "POST", headers: { "content-type": type }, body,
});

describe("bounded API JSON input", () => {
  it("accepts JSON objects and media type parameters", async () => {
    expect(await readJsonObject(request('{"text":"Olá"}', "application/json; charset=utf-8"))).toEqual({ text: "Olá" });
  });
  it.each(["null", "[]", "false", "broken JSON"])("rejects non-object or malformed input: %s", async (value) => {
    await expect(readJsonObject(request(value))).rejects.toMatchObject({ status: 400 });
  });
  it("measures actual UTF-8 bytes when Content-Length is absent or understated", async () => {
    const req = request('{"text":"' + "á".repeat(10) + '"}');
    req.headers.set("content-length", "1");
    await expect(readJsonObject(req, 25)).rejects.toMatchObject({ status: 413 });
  });
  it("rejects an excessive declared length before reading the body", async () => {
    const req = request("{}");
    req.headers.set("content-length", "100000");
    await expect(readJsonObject(req, 100)).rejects.toMatchObject({ status: 413 });
    expect(req.bodyUsed).toBe(false);
  });
  it("rejects non-JSON content and unsupported HTTP methods", async () => {
    await expect(readJsonObject(request("{}", "text/plain"))).rejects.toMatchObject({ status: 415 });
    await expect(readJsonObject(new Request("http://localhost"))).rejects.toMatchObject({ status: 405 });
  });
  it("does not serialize arbitrary exceptions", () => {
    expect(inputErrorResponse(new Error("private-detail-marker"), {})).toBeNull();
  });
});
