import { expect, test } from "bun:test";
import { CredentialStore } from "../src/infrastructure/credential-store";

function fixture(initial: string = '{"format":"kai-credential-v1","value":null}') {
  let payload = initial;
  const calls: { command: string; args: string[]; input?: string; env?: NodeJS.ProcessEnv }[] = [];
  const store = new CredentialStore("utsukuba-cli", {
    platform: "linux",
    env: { UTSUKUBA_SECRET_PROJECT: "test-project", UTSUKUBA_SECRET_PREFIX: "kai",
      UTSUKUBA_SECRET_ACCOUNT: "runtime@test-project.iam.gserviceaccount.com", CLOUDSDK_CORE_LOG_HTTP: "true" },
    run(command, args, options) {
      calls.push({ command, args, input: options.input, env: options.env });
      if (args[2] === "add") payload = options.input!;
      return { status: 0, stdout: args[2] === "access" ? payload : "", stderr: "" };
    },
  });
  return { store, calls, payload: () => payload };
}

test("Linux credentials round trip through a profile's secret without password arguments", () => {
  const { store, calls, payload } = fixture();
  expect(store.isAvailable()).toBe(true);
  expect(store.load("manaba-1")).toBeNull();
  store.save("manaba-1", { username: "fixture-user", password: "fixture-password\n " });
  expect(store.load("manaba-1", "ignored-hint")).toEqual({ username: "fixture-user", password: "fixture-password\n " });
  expect(JSON.parse(payload()).format).toBe("kai-credential-v1");
  const write = calls.find(call => call.args[2] === "add")!;
  expect(write.command).toBe("gcloud");
  expect(write.args).toContain("kai-manaba-1-credentials");
  expect(write.args).toContain("--data-file=-");
  expect(write.args).toContain("--account=runtime@test-project.iam.gserviceaccount.com");
  expect(write.args).toContain("--no-log-http");
  expect(write.env?.CLOUDSDK_CORE_LOG_HTTP).toBe("false");
  expect(write.args.join(" ")).not.toContain("fixture-password");
  const before = calls.filter(call => call.args[2] === "add").length;
  store.save("manaba-1", { username: "fixture-user", password: "fixture-password\n " });
  expect(calls.filter(call => call.args[2] === "add")).toHaveLength(before);
  store.delete("manaba-1");
  expect(store.load("manaba-1")).toBeNull();
});

test("Linux access errors and corrupt payloads fail closed without exposing captured output", () => {
  const store = new CredentialStore("utsukuba-cli", {
    platform: "linux", env: { UTSUKUBA_SECRET_PROJECT: "test-project" },
    run: () => ({ status: 1, stdout: "private-stdout", stderr: "private-stderr" }),
  });
  expect(() => store.load("manaba-1")).toThrow("Secret Manager");
  expect(() => store.save("manaba-1", { username: "user", password: "password" })).toThrow("Secret Manager");
  try { store.save("manaba-1", { username: "user", password: "password" }); }
  catch (error) { expect(String(error)).not.toMatch(/private-stdout|private-stderr|password/); }
  for (const payload of ["not json", '{"format":"unknown","value":null}', '{"format":"kai-credential-v1","value":"{}"}']) {
    expect(() => fixture(payload).store.load("manaba-1")).toThrow();
  }
});

test("Linux requires an explicit project and rejects unsafe profile names before access", () => {
  const store = new CredentialStore("utsukuba-cli", { platform: "linux", env: {} });
  expect(store.isAvailable()).toBe(false);
  expect(() => store.load("manaba-1")).toThrow();
  expect(() => fixture().store.load("../../other")).toThrow();
});

test("logout supports Linux sessions without credential storage and fails closed for configured write failures", () => {
  const unavailable = new CredentialStore("utsukuba-cli", {
    platform: "linux", env: {}, run: () => { throw new Error("must not run"); },
  });
  expect(() => unavailable.delete("manaba-1")).not.toThrow();
  const denied = new CredentialStore("utsukuba-cli", {
    platform: "linux", env: { UTSUKUBA_SECRET_PROJECT: "test-project" },
    run: () => ({ status: 1, stdout: "private-output", stderr: "private-output" }),
  });
  expect(() => denied.delete("manaba-1")).toThrow("Secret Manager");
});

test("macOS retains Keychain load and save", () => {
  const calls: string[][] = [];
  const store = new CredentialStore("utsukuba-cli", {
    platform: "darwin", env: {},
    run(command, args) {
      expect(command).toBe("security"); calls.push(args);
      return { status: 0, stdout: "fixture-password\n", stderr: "" };
    },
  });
  expect(store.load("school", "fixture-user")).toEqual({ username: "fixture-user", password: "fixture-password" });
  store.save("school", { username: "fixture-user", password: "fixture-password" });
  expect(calls[1]).toContain("add-generic-password");
});
