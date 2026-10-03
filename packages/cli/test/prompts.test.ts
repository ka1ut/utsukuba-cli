import { expect, test } from "bun:test";

test("password prompts reject noninteractive input instead of echoing it", async () => {
  const proc = Bun.spawn({
    cmd: ["bun", "-e", 'import { promptPassword } from "./packages/cli/src/presentation/prompts.ts"; try { await promptPassword("Password"); } catch { process.exitCode = 1; }'],
    cwd: `${import.meta.dir}/../../..`,
    stdin: new Blob(["fixture-password\n"]), stdout: "pipe", stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
  ]);
  expect(code).toBe(1);
  expect(stdout + stderr).not.toContain("fixture-password");
});
