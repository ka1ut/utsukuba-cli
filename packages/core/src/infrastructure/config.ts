import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
import type { AppConfig } from "../domain/types";
import type { Service } from "../domain/types";

const ConfigFileSchema = z
  .object({
    baseUrl: z.string().url().optional(),
    defaultProfile: z.string().min(1).optional(),
    output: z
      .object({
        pretty: z.boolean().optional(),
      })
      .optional(),
  })
  .passthrough();

export type LoadConfigOptions = {
  baseUrl?: string;
  profile?: string;
  homeDir?: string;
  debug?: boolean;
  env?: Record<string, string | undefined>;
};

const serviceBaseUrls: Record<Service, string> = {
  manaba: "https://manaba.tsukuba.ac.jp/ct",
  twins: "https://twins.tsukuba.ac.jp/campusweb/",
  kdb: "https://kdb.tsukuba.ac.jp/",
};

export function loadConfig(options: LoadConfigOptions = {}): AppConfig {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? env.MANABA_CLI_HOME ?? join(homedir(), ".manaba-cli");
  mkdirSync(homeDir, { recursive: true, mode: 0o700 });

  const configFile = join(homeDir, "config.json");
  const fileConfig = loadConfigFile(configFile);
  const baseUrl = stripTrailingSlash(
    options.baseUrl ?? env.MANABA_BASE_URL ?? fileConfig.baseUrl ?? "https://manaba.tsukuba.ac.jp/ct",
  );
  const profile = options.profile ?? env.MANABA_PROFILE ?? fileConfig.defaultProfile ?? "default";
  const authFile = join(homeDir, "profiles", profile, "auth.json");

  return {
    baseUrl,
    profile,
    homeDir,
    authFile,
    debug: options.debug ?? false,
  };
}

export function loadServiceConfig(service: Service, options: LoadConfigOptions = {}): AppConfig {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? env.UTSUKUBA_CLI_HOME ?? join(homedir(), ".utsukuba-cli");
  mkdirSync(homeDir, { recursive: true, mode: 0o700 });

  const configFile = join(homeDir, "config.json");
  const fileConfig = loadConfigFile(configFile);
  const envPrefix = service.toUpperCase();
  const baseUrl = stripTrailingSlash(
    options.baseUrl ?? env[`UTSUKUBA_${envPrefix}_BASE_URL`] ?? fileConfig.baseUrl ?? serviceBaseUrls[service],
  );
  const profile = options.profile ?? env.UTSUKUBA_PROFILE ?? fileConfig.defaultProfile ?? "default";
  const authFile = join(homeDir, "profiles", profile, service, "auth.json");

  return {
    baseUrl,
    profile,
    homeDir,
    authFile,
    debug: options.debug ?? false,
  };
}

function loadConfigFile(path: string): z.infer<typeof ConfigFileSchema> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  return ConfigFileSchema.parse(JSON.parse(raw));
}

export function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
