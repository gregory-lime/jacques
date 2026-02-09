import { spawn } from "child_process";

export function copyToClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = process.platform === "darwin"
      ? spawn("pbcopy")
      : spawn("xclip", ["-selection", "clipboard"]);

    proc.stdin.write(text);
    proc.stdin.end();

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Clipboard command failed with code ${code}`));
      }
    });

    proc.on("error", reject);
  });
}
