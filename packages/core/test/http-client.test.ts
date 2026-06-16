import { afterEach, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ManabaHttpClient } from "../src/infrastructure/http-client";
import { loadConfig } from "../src/infrastructure/config";

const tempDirs: string[] = [];

function tempDir(): string {
  const path = join(tmpdir(), `manaba-cli-download-${crypto.randomUUID()}`);
  mkdirSync(path, { recursive: true });
  tempDirs.push(path);
  return path;
}

afterEach(() => {
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true });
});

test("downloadFile writes response body and refuses overwrite by default", async () => {
  const out = tempDir();
  const config = loadConfig({ homeDir: tempDir() });
  let calls = 0;
  const client = new ManabaHttpClient(config, {
    fetch: async () => {
      calls += 1;
      return new Response("hello", {
        status: 200,
        headers: { "content-disposition": 'attachment; filename="hello.txt"' },
      });
    },
  });

  const first = await client.downloadFile(
    "https://manaba.tsukuba.ac.jp/ct/file/hello.txt?view=full",
    out,
    { cookies: [], overwrite: false },
  );

  expect(first.filename).toBe("hello.txt");
  expect(await Bun.file(first.path).text()).toBe("hello");
  await expect(
    client.downloadFile("https://manaba.tsukuba.ac.jp/ct/file/hello.txt?view=full", out, {
      cookies: [],
      overwrite: false,
    }),
  ).rejects.toThrow("already exists");
  expect(calls).toBe(1);
});
