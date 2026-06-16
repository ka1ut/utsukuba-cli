import type { AppConfig, KdbCourse, KdbSyllabus } from "../domain/types";
import { HttpError } from "../infrastructure/http-client";
import { parseKdbCourseSearchResponse, parseKdbSyllabus } from "../infrastructure/kdb-parsers";

export type KdbClient = {
  courses: {
    search(options: KdbSearchOptions): Promise<KdbCourse[]>;
  };
  syllabus: {
    show(courseCode: string, options?: KdbSyllabusOptions): Promise<KdbSyllabus>;
    html(courseCode: string, options?: KdbSyllabusOptions): Promise<string>;
  };
};

export type KdbSearchOptions = {
  year: string;
  query?: string;
  term?: string;
  day?: string;
  period?: string;
  includeSyllabus?: boolean;
  conductedInEnglish?: boolean;
  page?: number;
};

export type KdbSyllabusOptions = {
  year?: string;
  subcourse?: string;
  language?: "jpn" | "eng";
};

export function createKdbClient(config: AppConfig, deps: { fetch?: typeof fetch } = {}): KdbClient {
  const fetchImpl = deps.fetch ?? fetch;
  const jar = new SimpleCookieJar();
  const baseUrl = `${config.baseUrl}/`;

  const request = async (body?: URLSearchParams): Promise<Response> => {
    const res = await fetchImpl(baseUrl, {
      method: body ? "POST" : "GET",
      headers: {
        Accept: body ? "application/json,text/javascript,*/*;q=0.01" : "text/html,application/xhtml+xml",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        "User-Agent": "utsukuba-cli/0.1",
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(jar.header() ? { Cookie: jar.header() } : {}),
      },
      body,
    });
    jar.absorb(res.headers);
    if (config.debug) console.error(`${body ? "POST" : "GET"} ${res.status} ${baseUrl}`);
    return res;
  };

  const ensureSession = async () => {
    if (!jar.header()) await request();
  };

  return {
    courses: {
      async search(options) {
        await ensureSession();
        const params = new URLSearchParams({
          pageId: "SB0070",
          action: "search",
          txtFy: options.year,
          cmbTerm: options.term ?? "",
          cmbDay: options.day ?? "",
          cmbPeriod: options.period ?? "",
          hdnOrg: "",
          hdnReq: "",
          hdnFac: "",
          hdnDepth: "",
          chkSyllabi: String(options.includeSyllabus ?? false),
          chkAuditor: "false",
          chkExchangeStudent: "false",
          chkConductedInEnglish: String(options.conductedInEnglish ?? false),
          txtSyllabus: options.query ?? "",
          reschedule: "true",
          page: String(options.page ?? 0),
          total: "-1",
        });
        const res = await request(params);
        const text = await res.text();
        if (!res.ok) throw new HttpError(res.status, baseUrl, text);
        return parseKdbCourseSearchResponse(JSON.parse(text), options.year, config.baseUrl);
      },
    },
    syllabus: {
      async html(courseCode, options = {}) {
        await ensureSession();
        const year = options.year ?? String(new Date().getFullYear());
        const language = options.language ?? "jpn";
        const params = new URLSearchParams();
        params.append("pageId", "SB0070");
        params.append("pageId", "SB0220");
        params.set("action", "preview");
        params.set("course", courseCode);
        params.set("subcourse", options.subcourse ?? "0");
        params.set("official", "");
        params.set("tags", "on");
        params.set("fy", year);
        params.set("lang", language);
        const res = await request(params);
        const text = await res.text();
        if (!res.ok) throw new HttpError(res.status, baseUrl, text);
        return text;
      },
      async show(courseCode, options = {}) {
        const year = options.year ?? String(new Date().getFullYear());
        const language = options.language ?? "jpn";
        return parseKdbSyllabus(await this.html(courseCode, options), year, language);
      },
    },
  };
}

class SimpleCookieJar {
  private readonly cookies = new Map<string, string>();

  absorb(headers: Headers): void {
    const values = getSetCookieValues(headers);
    for (const value of values) {
      const pair = value.split(";")[0] ?? "";
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

function getSetCookieValues(headers: Headers): string[] {
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") return anyHeaders.getSetCookie();
  const combined = headers.get("set-cookie");
  return combined ? [combined] : [];
}
