import pc from "picocolors";
import { HttpError } from "@manaba/core";

export function printError(error: unknown): void {
  if (error instanceof HttpError) {
    console.error(pc.red(error.message));
    if (error.body) console.error(error.body.slice(0, 1000));
    return;
  }
  if (error instanceof Error) {
    console.error(pc.red(error.message));
    return;
  }
  console.error(pc.red(String(error)));
}
