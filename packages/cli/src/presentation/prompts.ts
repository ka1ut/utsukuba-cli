import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { spawnSync } from "node:child_process";

export async function promptText(label: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(`${label}: `)).trim();
  } finally {
    rl.close();
  }
}

export async function promptPassword(label: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error("Enter the password in an interactive SSH terminal.");

  setEcho(false);
  const rl = createInterface({ input, output, terminal: false });
  try {
    return await rl.question(`${label}: `);
  } finally {
    setEcho(true);
    output.write("\n");
    rl.close();
  }
}

function setEcho(enabled: boolean): void {
  const result = spawnSync("stty", [enabled ? "echo" : "-echo"], { stdio: ["inherit", "ignore", "ignore"] });
  if (result.status !== 0) throw new Error("Could not configure terminal password masking.");
}
