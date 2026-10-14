import { describe, expect, it } from "vitest";
import { assertPublicFrontendEnv } from "@/lib/publicBackendConfig";

function jwt(role: string) {
  return btoa('{"alg":"HS256"}') + "." + btoa(JSON.stringify({ role })) + ".fixture";
}

describe("public frontend configuration", () => {
  it("accepts public anon JWTs and publishable keys", () => {
    expect(() => assertPublicFrontendEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: jwt("anon") })).not.toThrow();
    expect(() => assertPublicFrontendEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_" + "a".repeat(20) })).not.toThrow();
  });
  it.each(["service_role", "authenticated"])("rejects a %s JWT", (role) => {
    expect(() => assertPublicFrontendEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: jwt(role) })).toThrow("somente uma chave pública");
  });
  it("rejects secret keys without reflecting their values", () => {
    const key = "sb_secret_" + "a".repeat(30);
    try {
      assertPublicFrontendEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: key });
      throw new Error("unexpected acceptance");
    } catch (error) {
      expect(String(error)).toContain("somente uma chave pública");
      expect(String(error)).not.toContain(key);
    }
  });
  it("blocks private credentials in other VITE variables", () => {
    expect(() => assertPublicFrontendEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: jwt("anon"), VITE_CRON_SECRET: "private-detail" })).toThrow("Configuração privada");
  });
});
