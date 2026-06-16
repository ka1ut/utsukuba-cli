import type { AppConfig, AuthProfile, CookieRecord, StudentProfile, TwinGrade, TwinRegistration } from "../domain/types";
import { AuthStore } from "../infrastructure/auth-store";
import { CredentialStore } from "../infrastructure/credential-store";
import { HttpError } from "../infrastructure/http-client";
import {
  buildTwinsLoginPayload,
  parseTwinsMenuItems,
  parseTwinsGrades,
  parseTwinsRegistrations,
  parseTwinsStudentProfile,
  resolveTwinsFeatureUrl,
  isTwinsAuthErrorHtml,
} from "../infrastructure/twins-parsers";

export type TwinsClient = {
  auth: TwinsAuthUseCases;
  pages: {
    html(pathOrUrl?: string): Promise<string>;
  };
  menus: {
    list(): Promise<Array<{ label: string; url: string; flowId?: string }>>;
  };
  profile: {
    show(pathOrUrl?: string): Promise<StudentProfile>;
  };
  registrations: {
    list(pathOrUrl?: string): Promise<TwinRegistration[]>;
  };
  grades: {
    list(pathOrUrl?: string): Promise<TwinGrade[]>;
  };
};

export function createTwinsClient(
  config: AppConfig,
  deps: { fetch?: typeof fetch; authStore?: AuthStore; credentialStore?: CredentialStore } = {},
): TwinsClient {
  const fetchImpl = deps.fetch ?? fetch;
  const authStore = deps.authStore ?? new AuthStore(config);
  const credentialStore = deps.credentialStore ?? new CredentialStore("utsukuba-cli");
  const http = new TwinsHttp(config, fetchImpl);
  const auth = new TwinsAuthUseCases(config, http, authStore, credentialStore);

  const html = async (pathOrUrl = "portal.do?page=main") => {
    const profile = await auth.requireProfile();
    try {
      return await http.getHtml(pathOrUrl, profile.cookies);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401 || !profile.credentialStored) throw error;
      const refreshed = await auth.refresh();
      return http.getHtml(pathOrUrl, refreshed.cookies);
    }
  };

  const featureHtml = async (feature: "profile" | "registrations" | "grades", pathOrUrl?: string) => {
    if (pathOrUrl) return html(pathOrUrl);
    const portal = await html("portal.do?page=main");
    const resolved = resolveTwinsFeatureUrl(portal, feature);
    if (!resolved) {
      const labels = parseTwinsMenuItems(portal).map((item) => item.label).filter(Boolean).slice(0, 20);
      throw new Error([
        `Could not find TWINS ${feature} menu automatically.`,
        "Run `utsukuba twins menus --pretty` to inspect available menu labels, or pass --url explicitly.",
        labels.length ? `Detected menus: ${labels.join(", ")}` : "No CAMPUSSQUARE menu links were detected. The session may not be authenticated.",
      ].join(" "));
    }
    return html(resolved);
  };

  return {
    auth,
    pages: { html },
    menus: { list: async () => parseTwinsMenuItems(await html("portal.do?page=main")) },
    profile: { show: async (pathOrUrl) => parseTwinsStudentProfile(await featureHtml("profile", pathOrUrl)) },
    registrations: { list: async (pathOrUrl) => parseTwinsRegistrations(await featureHtml("registrations", pathOrUrl)) },
    grades: { list: async (pathOrUrl) => parseTwinsGrades(await featureHtml("grades", pathOrUrl)) },
  };
}

export class TwinsAuthUseCases {
  constructor(
    private readonly config: AppConfig,
    private readonly http: TwinsHttp,
    private readonly store: AuthStore,
    private readonly credentials: CredentialStore,
  ) {}

  async login(options: { username: string; password: string; saveCredentials?: boolean }): Promise<AuthProfile> {
    const cookies = await this.http.login(options.username, options.password);
    const credentialStored = options.saveCredentials ?? true;
    if (credentialStored) {
      this.credentials.save(this.config.profile, { username: options.username, password: options.password });
    }
    const profile: AuthProfile = {
      profile: this.config.profile,
      baseUrl: this.config.baseUrl,
      cookies,
      username: options.username,
      credentialStored,
      savedAt: new Date().toISOString(),
    };
    await this.store.save(profile);
    return profile;
  }

  async check(): Promise<{ ok: boolean; profile: string; username?: string; reason?: string }> {
    const profile = await this.store.load();
    if (!profile) return { ok: false, profile: this.config.profile, reason: "not_configured" };
    try {
      const html = await this.http.getHtml("portal.do?page=main", profile.cookies);
      return { ok: true, profile: profile.profile, username: profile.username };
    } catch (error) {
      if (error instanceof HttpError && error.status === 401 && profile.credentialStored) {
        try {
          const refreshed = await this.refresh();
          return { ok: true, profile: refreshed.profile, username: refreshed.username };
        } catch (refreshError) {
          return {
            ok: false,
            profile: profile.profile,
            username: profile.username,
            reason: refreshError instanceof Error ? refreshError.message : String(refreshError),
          };
        }
      }
      return {
        ok: false,
        profile: profile.profile,
        username: profile.username,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async refresh(): Promise<AuthProfile> {
    const profile = await this.requireProfile();
    const stored = this.credentials.load(this.config.profile, profile.username);
    if (!stored) throw new Error("No saved Keychain credentials for this profile.");
    return this.login({ username: stored.username, password: stored.password, saveCredentials: true });
  }

  async logout(): Promise<void> {
    await this.store.remove();
  }

  async requireProfile(): Promise<AuthProfile> {
    const profile = await this.store.load();
    if (!profile) throw new Error("Not logged in to TWINS. Run `utsukuba twins login` first.");
    return profile;
  }
}

class TwinsHttp {
  constructor(
    private readonly config: AppConfig,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async getHtml(pathOrUrl: string, cookies: CookieRecord[] = []): Promise<string> {
    const url = this.url(pathOrUrl);
    const res = await this.fetchImpl(url, { headers: this.headers(cookies) });
    const body = await res.text();
    this.debug("GET", res.status, url);
    if (isTwinsAuthErrorHtml(body)) throw new HttpError(401, url, body);
    if (!res.ok) throw new HttpError(res.status, url, body);
    return body;
  }

  async login(username: string, password: string): Promise<CookieRecord[]> {
    const jar = new CookieJar();
    const loginUrl = this.url("");
    const loginPage = await this.fetchImpl(loginUrl, { headers: this.headers(jar.cookies()) });
    jar.absorb(loginPage.headers);
    const loginHtml = await loginPage.text();
    this.debug("GET", loginPage.status, loginUrl);
    if (!loginPage.ok) throw new HttpError(loginPage.status, loginUrl, loginHtml);

    const payload = buildTwinsLoginPayload(loginHtml, username, password);
    const portalUrl = this.url("portal.do");
    const loginRes = await this.fetchImpl(portalUrl, {
      method: "POST",
      headers: {
        ...this.headers(jar.cookies()),
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Referer: loginUrl,
      },
      body: payload,
    });
    jar.absorb(loginRes.headers);
    const result = await loginRes.text();
    this.debug("POST", loginRes.status, portalUrl);
    if (!loginRes.ok) throw new HttpError(loginRes.status, portalUrl, result);
    if (!/login ok\.|ログアウト|PortalMain|portal/i.test(result)) {
      throw new Error(cleanLoginFailure(result));
    }
    return jar.cookies();
  }

  private headers(cookies: CookieRecord[]): Record<string, string> {
    const cookie = cookies.map((item) => `${item.name}=${item.value}`).join("; ");
    return {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      "User-Agent": "utsukuba-cli/0.1",
      ...(cookie ? { Cookie: cookie } : {}),
    };
  }

  private url(pathOrUrl: string): string {
    return new URL(pathOrUrl, `${this.config.baseUrl}/`).toString();
  }

  private debug(method: string, status: number, url: string): void {
    if (this.config.debug) console.error(`${method} ${status} ${url}`);
  }
}

class CookieJar {
  private readonly values = new Map<string, CookieRecord>();

  absorb(headers: Headers): void {
    for (const value of getSetCookieValues(headers)) {
      const cookie = parseSetCookie(value);
      if (cookie) this.values.set(cookie.name, cookie);
    }
  }

  cookies(): CookieRecord[] {
    return [...this.values.values()];
  }
}

function cleanLoginFailure(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "TWINS login failed.";
}

function getSetCookieValues(headers: Headers): string[] {
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") return anyHeaders.getSetCookie();
  const combined = headers.get("set-cookie");
  return combined ? [combined] : [];
}

function parseSetCookie(value: string): CookieRecord | null {
  const [pair, ...attrs] = value.split(";");
  const index = pair.indexOf("=");
  if (index < 1) return null;
  const cookie: CookieRecord = { name: pair.slice(0, index).trim(), value: pair.slice(index + 1).trim() };
  for (const attr of attrs) {
    const [rawKey, rawValue] = attr.split("=");
    const key = rawKey.trim().toLowerCase();
    if (key === "domain") cookie.domain = rawValue?.trim();
    if (key === "path") cookie.path = rawValue?.trim();
    if (key === "expires") cookie.expires = rawValue?.trim();
  }
  return cookie;
}
