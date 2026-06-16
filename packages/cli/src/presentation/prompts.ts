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
  if (!process.stdin.isTTY) return promptText(label);

  const rl = createInterface({ input, output });
  setEcho(false);
  try {
    return await rl.question(`${label}: `);
  } finally {
    setEcho(true);
    output.write("\n");
    rl.close();
  }
}

function setEcho(enabled: boolean): void {
  spawnSync("stty", [enabled ? "echo" : "-echo"], { stdio: ["inherit", "ignore", "ignore"] });
}
