import { spawnSync } from "node:child_process";
import { platform } from "node:os";

export type StoredCredentials = { username: string; password: string };
type RunOptions = { input?: string; env?: NodeJS.ProcessEnv };
type RunResult = { status: number | null; stdout: string; stderr: string; error?: Error };
type Runtime = {
  platform?: string;
  env?: NodeJS.ProcessEnv;
  run?: (command: string, args: string[], options: RunOptions) => RunResult;
};

export class CredentialStore {
  private readonly os: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly run: NonNullable<Runtime["run"]>;

  constructor(private readonly service = "utsukuba-cli", runtime: Runtime = {}) {
    this.os = runtime.platform ?? platform();
    this.env = runtime.env ?? process.env;
    this.run = runtime.run ?? ((command, args, options) => spawnSync(command, args, {
      ...options, encoding: "utf8", timeout: 30_000, maxBuffer: 256 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    }));
  }

  isAvailable(): boolean {
    return this.os === "darwin" || (this.os === "linux" && Boolean(this.env.UTSUKUBA_SECRET_PROJECT));
  }

  save(profile: string, credentials: StoredCredentials): void {
    if (this.os === "linux") {
      const current = this.load(profile);
      // Session refreshes must not create another version of an unchanged password.
      if (current?.username === credentials.username && current.password === credentials.password) return;
      this.writeSecret(profile, JSON.stringify(credentials));
      return;
    }
    this.requireDarwin();
    const result = this.run("security", [
      "add-generic-password", "-a", account(profile), "-s", this.service,
      "-U", "-w", credentials.password, "-j", credentials.username,
    ], {});
    if (result.status !== 0 || result.error) throw new Error("Failed to update macOS Keychain.");
  }

  load(profile: string, username?: string): StoredCredentials | null {
    if (this.os === "linux") {
      const raw = this.secretCommand(profile, ["access", "latest"]);
      try {
        const envelope = JSON.parse(raw);
        if (envelope.format !== "kai-credential-v1") throw new Error();
        if (envelope.value === null) return null;
        if (typeof envelope.value !== "string") throw new Error();
        const credentials = JSON.parse(envelope.value);
        if (typeof credentials.username !== "string" || !credentials.username ||
            typeof credentials.password !== "string" || !credentials.password) throw new Error();
        return { username: credentials.username, password: credentials.password };
      } catch {
        throw new Error("Invalid Secret Manager credential payload; contents withheld.");
      }
    }
    this.requireDarwin();
    const result = this.run("security", [
      "find-generic-password", "-a", account(profile), "-s", this.service, "-w",
    ], {});
    if (result.status !== 0 || result.error) return null;
    return { username: username ?? profile, password: result.stdout.trimEnd() };
  }

  delete(profile: string): void {
    if (!this.isAvailable()) return;
    if (this.os === "linux") {
      this.writeSecret(profile, null);
      return;
    }
    this.run("security", ["delete-generic-password", "-a", account(profile), "-s", this.service], {});
  }

  private writeSecret(profile: string, value: string | null): void {
    this.secretCommand(profile, ["add"], JSON.stringify({ format: "kai-credential-v1", value }));
  }

  private secretCommand(profile: string, operation: string[], input?: string): string {
    const project = this.env.UTSUKUBA_SECRET_PROJECT;
    const prefix = this.env.UTSUKUBA_SECRET_PREFIX ?? "utsukuba";
    if (!project || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) ||
        !/^[a-zA-Z0-9_-]+$/.test(prefix) || !/^[a-zA-Z0-9_-]+$/.test(profile) ||
        `${prefix}-${profile}-credentials`.length > 255) {
      throw new Error("Configure UTSUKUBA_SECRET_PROJECT and valid Secret Manager profile names.");
    }
    const secret = `${prefix}-${profile}-credentials`;
    const args = ["secrets", "versions", ...operation];
    if (operation[0] === "add") args.push(secret, "--data-file=-");
    else args.push(`--secret=${secret}`);
    args.push(`--project=${project}`, "--quiet", "--no-log-http", "--verbosity=error");
    if (this.env.UTSUKUBA_SECRET_ACCOUNT) args.push(`--account=${this.env.UTSUKUBA_SECRET_ACCOUNT}`);
    let result: RunResult;
    try {
      result = this.run("gcloud", args, { input, env: {
        ...this.env, CLOUDSDK_CORE_LOG_HTTP: "false", CLOUDSDK_CORE_VERBOSITY: "error",
      } });
    } catch {
      throw new Error("Secret Manager command unavailable; contents withheld.");
    }
    if (result.status !== 0 || result.error) {
      throw new Error("Secret Manager access failed or timed out; check provisioning and IAM. Contents withheld.");
    }
    return result.stdout;
  }

  private requireDarwin(): void {
    if (this.os !== "darwin") throw new Error("Credential storage requires macOS Keychain or Linux Secret Manager.");
  }
}

function account(profile: string): string { return `profile:${profile}`; }
