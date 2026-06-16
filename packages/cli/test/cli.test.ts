import { expect, test } from "bun:test";

test("utsukuba exposes manaba subcommands for namespaced login", async () => {
  const proc = Bun.spawn({
    cmd: ["bun", "packages/cli/src/index.ts", "manaba", "login", "--help"],
    cwd: `${import.meta.dir}/../../..`,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(stdout).toContain("Usage: utsukuba manaba login");
  expect(stdout).toContain("--username");
});
