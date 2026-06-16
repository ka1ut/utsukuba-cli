import { closeSync, openSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AppConfig, AuthProfile } from "../domain/types";

export class AuthStore {
  constructor(private readonly config: AppConfig) {}

  async load(): Promise<AuthProfile | null> {
    const file = Bun.file(this.config.authFile);
    if (!(await file.exists())) return null;
    return JSON.parse(await file.text()) as AuthProfile;
  }

  async save(profile: AuthProfile): Promise<void> {
    mkdirSync(dirname(this.config.authFile), { recursive: true, mode: 0o700 });
    const fd = openSync(this.config.authFile, "w", 0o600);
    try {
      writeFileSync(fd, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
    } finally {
      closeSync(fd);
    }
  }

  async remove(): Promise<void> {
    await Bun.file(this.config.authFile).delete().catch(() => undefined);
  }
}
