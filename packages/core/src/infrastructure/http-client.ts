import { mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import * as cheerio from "cheerio";
import type { AppConfig, CookieRecord, DownloadResult } from "../domain/types";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string,
  ) {
    super(`HTTP ${status}: ${url}`);
  }
}

export type HttpClientDeps = {
  fetch?: FetchLike;
};

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type RequestAuth = {
  cookies: CookieRecord[];
  overwrite?: boolean;
};

export class ManabaHttpClient {
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly config: AppConfig,
    deps: HttpClientDeps = {},
  ) {
    this.fetchImpl = deps.fetch ?? fetch;
  }

  async getHtml(pathOrUrl: string, cookies: CookieRecord[] = []): Promise<string> {
    const url = this.url(pathOrUrl);
    const res = await this.fetchImpl(url, { headers: this.headers(cookies), redirect: "manual" });
    const body = await res.text();
    this.debug("GET", res.status, url);
    if (isLoginRedirect(res, body)) throw new HttpError(401, url, body);
    if (!res.ok) throw new HttpError(res.status, url, body);
    return body;
  }

  async postForm(pathOrUrl: string, body: URLSearchParams, cookies: CookieRecord[] = []): Promise<Response> {
    const url = this.url(pathOrUrl);
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        ...this.headers(cookies),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      redirect: "manual",
    });
    this.debug("POST", res.status, url);
    return res;
  }

  async loginWithCredentials(username: string, password: string): Promise<CookieRecord[]> {
    const jar = new CookieJar();
    let currentUrl = this.url("login");
    let method: "GET" | "POST" = "GET";
    let body: URLSearchParams | undefined;
    let submittedPassword = false;

    for (let step = 0; step < 24; step += 1) {
      const res = await this.fetchImpl(currentUrl, {
        method,
        headers: {
          ...this.headers(jar.cookies()),
          ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded", Referer: currentUrl } : {}),
        },
        body,
        redirect: "manual",
      });
      jar.absorb(res.headers);
      this.debug(method, res.status, currentUrl);

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        currentUrl = new URL(location, currentUrl).toString();
        method = "GET";
        body = undefined;
        continue;
      }

      const html = await res.text();
      if (!res.ok) throw new HttpError(res.status, currentUrl, html);
      if (isAuthenticatedManabaPage(this.config.baseUrl, currentUrl, html)) {
        return jar.cookies();
      }

      const form = parseFirstForm(html, currentUrl);
      if (!form) break;
      if (form.hasPassword && submittedPassword) {
        throw new Error("Login failed. Check the manaba ID/password.");
      }
      if (form.hasPassword) {
        form.fields.set("j_username", username);
        form.fields.set("j_password", password);
        form.fields.set("username", username);
        form.fields.set("password", password);
        if (!form.fields.has("_eventId_proceed")) form.fields.set("_eventId_proceed", "");
        submittedPassword = true;
      }

      currentUrl = form.action;
      method = "POST";
      body = form.fields;
    }

    throw new Error("Login flow did not reach an authenticated manaba page.");
  }

  async downloadFile(pathOrUrl: string, outDir: string, auth: RequestAuth): Promise<DownloadResult> {
    const url = this.url(pathOrUrl);
    const provisionalFilename = decodeURIComponent(basename(new URL(url).pathname));
    const provisionalPath = join(outDir, provisionalFilename);
    if (!auth.overwrite && (await Bun.file(provisionalPath).exists())) {
      throw new Error(`${provisionalPath} already exists`);
    }

    const res = await this.fetchImpl(url, { headers: this.headers(auth.cookies) });
    this.debug("GET", res.status, url);
    if (!res.ok) throw new HttpError(res.status, url, await res.text());

    const filename = filenameFromResponse(url, res.headers);
    const path = join(outDir, filename);
    const existing = Bun.file(path);
    if (!auth.overwrite && (await existing.exists())) throw new Error(`${path} already exists`);

    mkdirSync(outDir, { recursive: true });
    const bytes = new Uint8Array(await res.arrayBuffer());
    await Bun.write(path, bytes);
    return { filename, path, bytes: bytes.byteLength, url };
  }

  parseSetCookie(headers: Headers): CookieRecord[] {
    const values = getSetCookieValues(headers);
    return values.map(parseSetCookie).filter((cookie): cookie is CookieRecord => cookie !== null);
  }

  cookieHeader(cookies: CookieRecord[]): string {
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  }

  private headers(cookies: CookieRecord[]): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      "User-Agent": "utsukuba-cli/0.1 (+https://github.com/local/utsukuba-cli)",
    };
    const cookie = this.cookieHeader(cookies);
    if (cookie) headers.Cookie = cookie;
    return headers;
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

function isLoginRedirect(res: Response, body: string): boolean {
  const location = res.headers.get("location") ?? "";
  return res.status >= 300 && res.status < 400 && /login|saml|Shibboleth/i.test(location)
    || /ログイン|login/i.test(body) && !/ログアウト/.test(body);
}

function isAuthenticatedManabaPage(baseUrl: string, currentUrl: string, html: string): boolean {
  const base = new URL(baseUrl);
  const current = new URL(currentUrl);
  return current.hostname === base.hostname && /ログアウト|マイページ|home_course/.test(html);
}

function parseFirstForm(html: string, currentUrl: string): null | {
  action: string;
  fields: URLSearchParams;
  hasPassword: boolean;
} {
  const $ = cheerio.load(html);
  const form = $("form").first();
  if (form.length === 0) return null;
  const action = new URL(form.attr("action") || currentUrl, currentUrl).toString();
  const fields = new URLSearchParams();

  form.find("input,button").each((_, element) => {
    const name = $(element).attr("name");
    if (!name) return;
    fields.set(name, $(element).attr("value") ?? "");
  });

  return {
    action,
    fields,
    hasPassword: form.find("input[type='password'], input[name='j_password'], input[name='password']").length > 0,
  };
}

function filenameFromResponse(url: string, headers: Headers): string {
  const disposition = headers.get("content-disposition") ?? "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  const quoted = /filename="([^"]+)"/i.exec(disposition)?.[1];
  if (quoted) return quoted;
  return decodeURIComponent(basename(new URL(url).pathname));
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
  const cookie: CookieRecord = {
    name: pair.slice(0, index).trim(),
    value: pair.slice(index + 1).trim(),
  };
  for (const attr of attrs) {
    const [rawKey, rawValue] = attr.split("=");
    const key = rawKey.trim().toLowerCase();
    const attrValue = rawValue?.trim();
    if (key === "domain") cookie.domain = attrValue;
    if (key === "path") cookie.path = attrValue;
    if (key === "expires") cookie.expires = attrValue;
  }
  return cookie;
}
