import { expect, test } from "bun:test";
import { createManabaClient } from "../src/application/manaba-client";
import { loadConfig } from "../src/infrastructure/config";
import { AuthStore } from "../src/infrastructure/auth-store";
import { CredentialStore } from "../src/infrastructure/credential-store";
import { ManabaHttpClient } from "../src/infrastructure/http-client";

class MemoryAuthStore extends AuthStore {
  private profile: Awaited<ReturnType<AuthStore["load"]>> = null;

  override async load() {
    return this.profile;
  }

  override async save(profile: NonNullable<Awaited<ReturnType<AuthStore["load"]>>>) {
    this.profile = profile;
  }
}

class NoopCredentialStore extends CredentialStore {
  override save(): void {}
  override load(): null {
    return null;
  }
  override delete(): void {}
}

test("login follows Tsukuba IdP proceed form and stores returned cookies", async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const config = loadConfig({ homeDir: `/tmp/manaba-cli-login-${crypto.randomUUID()}` });
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body?.toString() });

    if (url === `${config.baseUrl}/login`) {
      return redirect("https://idp.example.test/sso?SAMLRequest=abc", "MANABA_ROUTE=1; Path=/");
    }
    if (url === "https://idp.example.test/sso?SAMLRequest=abc") {
      return redirect("https://idp.example.test/sso?execution=e1s1", "IDP_SESSION=2; Path=/");
    }
    if (url === "https://idp.example.test/sso?execution=e1s1" && method === "GET") {
      return html(`<form action="/sso?execution=e1s1" method="post">
        <input name="shib_idp_ls_success.shib_idp_session_ss" value="false">
        <input name="_eventId_proceed">
      </form>`);
    }
    if (url === "https://idp.example.test/sso?execution=e1s1" && method === "POST") {
      return redirect("https://idp.example.test/sso?execution=e1s2");
    }
    if (url === "https://idp.example.test/sso?execution=e1s2" && method === "GET") {
      return html(`<form action="/sso?execution=e1s2" method="post">
        <input name="j_username">
        <input name="j_password" type="password">
        <button name="_eventId_proceed">Login</button>
      </form>`);
    }
    if (url === "https://idp.example.test/sso?execution=e1s2" && method === "POST") {
      return html(`<form action="${config.baseUrl}/SAML2/POST" method="post">
        <input name="SAMLResponse" value="token">
        <input name="RelayState" value="relay">
      </form>`);
    }
    if (url === `${config.baseUrl}/SAML2/POST` && method === "POST") {
      return redirect(`${config.baseUrl}/home`, "manaba_session=ok; Path=/");
    }
    if (url === `${config.baseUrl}/home`) {
      return html(`ログアウト`);
    }
    throw new Error(`unexpected request: ${method} ${url}`);
  };

  const client = createManabaClient(config, {
    http: new ManabaHttpClient(config, { fetch: fetchImpl }),
    authStore: new MemoryAuthStore(config),
    credentialStore: new NoopCredentialStore(),
  });

  const profile = await client.auth.login({
    username: "0012025101433",
    password: "secret",
    saveCredentials: false,
  });

  expect(profile.cookies.some((cookie) => cookie.name === "manaba_session" && cookie.value === "ok")).toBe(true);
  expect(calls.some((call) => call.body?.includes("j_username=0012025101433"))).toBe(true);
  expect(calls.some((call) => call.body?.includes("j_password=secret"))).toBe(true);
});

test("manaba commands tell users to run utsukuba login when no profile is saved", async () => {
  const config = loadConfig({ homeDir: `/tmp/manaba-cli-missing-${crypto.randomUUID()}` });
  const client = createManabaClient(config);

  await expect(client.tasks.list()).rejects.toThrow("Not logged in to manaba. Run `utsukuba login` or `utsukuba manaba login` first.");
});

function redirect(location: string, setCookie?: string): Response {
  const headers = new Headers({ location });
  if (setCookie) headers.append("set-cookie", setCookie);
  return new Response("", { status: 302, headers });
}

function html(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
}
