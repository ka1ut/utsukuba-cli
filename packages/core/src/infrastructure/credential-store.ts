import { spawnSync } from "node:child_process";
import { platform } from "node:os";

export type StoredCredentials = {
  username: string;
  password: string;
};

export class CredentialStore {
  constructor(private readonly service = "manaba-cli") {}

  isAvailable(): boolean {
    return platform() === "darwin";
  }

  save(profile: string, credentials: StoredCredentials): void {
    this.requireDarwin();
    runSecurity([
      "add-generic-password",
      "-a",
      account(profile),
      "-s",
      this.service,
      "-U",
      "-w",
      credentials.password,
      "-j",
      credentials.username,
    ]);
  }

  load(profile: string, username?: string): StoredCredentials | null {
    this.requireDarwin();
    const password = spawnSync("security", [
      "find-generic-password",
      "-a",
      account(profile),
      "-s",
      this.service,
      "-w",
    ], { encoding: "utf8" });

    if (password.status !== 0) return null;
    return {
      username: username ?? profile,
      password: password.stdout.trimEnd(),
    };
  }

  delete(profile: string): void {
    if (!this.isAvailable()) return;
    spawnSync("security", [
      "delete-generic-password",
      "-a",
      account(profile),
      "-s",
      this.service,
    ], { encoding: "utf8" });
  }

  private requireDarwin(): void {
    if (!this.isAvailable()) {
      throw new Error("Credential refresh requires macOS Keychain on this platform.");
    }
  }
}

function account(profile: string): string {
  return `profile:${profile}`;
}

function runSecurity(args: string[]): void {
  const result = spawnSync("security", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "failed to update macOS Keychain");
  }
}
