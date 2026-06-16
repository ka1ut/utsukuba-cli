import { afterEach, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../src/infrastructure/config";
import { AuthStore } from "../src/infrastructure/auth-store";

const tempHomes: string[] = [];

function tempHome(): string {
  const path = join(tmpdir(), `manaba-cli-test-${crypto.randomUUID()}`);
  tempHomes.push(path);
  return path;
}

afterEach(() => {
  for (const path of tempHomes.splice(0)) rmSync(path, { recursive: true, force: true });
});

test("loadConfig uses defaults and profile overrides", () => {
  const home = tempHome();
  const config = loadConfig({ profile: "school", homeDir: home });

  expect(config.baseUrl).toBe("https://manaba.tsukuba.ac.jp/ct");
  expect(config.profile).toBe("school");
  expect(config.homeDir).toBe(home);
  expect(config.authFile).toBe(join(home, "profiles", "school", "auth.json"));
});

test("AuthStore writes profile auth with owner-only permissions", async () => {
  const home = tempHome();
  const config = loadConfig({ profile: "default", homeDir: home });
  const store = new AuthStore(config);

  await store.save({
    profile: "default",
    baseUrl: config.baseUrl,
    cookies: [{ name: "SESSION", value: "abc" }],
    username: "s1234567",
    credentialStored: true,
    savedAt: "2026-06-16T00:00:00.000Z",
  });

  const loaded = await store.load();
  const stat = await Bun.file(config.authFile).stat();

  expect(loaded?.cookies).toEqual([{ name: "SESSION", value: "abc" }]);
  expect(loaded?.credentialStored).toBe(true);
  expect(stat.mode & 0o777).toBe(0o600);
});
