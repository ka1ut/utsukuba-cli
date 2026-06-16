export type OutputOptions = {
  json?: boolean;
  pretty?: boolean;
};

export function printData(data: unknown, options: OutputOptions = {}): void {
  if (options.json || options.pretty) {
    console.log(JSON.stringify(data, null, options.pretty ? 2 : 0));
    return;
  }
  if (Array.isArray(data)) {
    console.table(data.map(flattenForTable));
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

function flattenForTable(value: unknown): Record<string, string | number | boolean | undefined> {
  if (!value || typeof value !== "object") return { value: String(value) };
  const result: Record<string, string | number | boolean | undefined> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null || entry === undefined) result[key] = undefined;
    else if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") result[key] = entry;
    else if (Array.isArray(entry)) result[key] = `${entry.length} item(s)`;
    else result[key] = "[object]";
  }
  return result;
}
