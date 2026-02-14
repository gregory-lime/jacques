/**
 * Update command — check for and install the latest version of Jacques.
 */

import { spawn } from "child_process";

const REGISTRY_URL = "https://registry.npmjs.org/jacques/latest";
const PACKAGE_NAME = "jacques";

/**
 * Compare two semver strings (MAJOR.MINOR.PATCH).
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

/**
 * Detect if running under npx (which caches packages).
 */
function isRunningUnderNpx(): boolean {
  if (process.env.npm_command === "exec") return true;
  const execPath = process.env.npm_execpath || "";
  if (execPath.includes("npx")) return true;
  return false;
}

/**
 * Fetch the latest version from the npm registry.
 */
async function fetchLatestVersion(): Promise<string> {
  const response = await fetch(REGISTRY_URL);
  if (!response.ok) {
    throw new Error(
      `Registry returned ${response.status}: ${response.statusText}`
    );
  }
  const data = (await response.json()) as { version: string };
  if (!data.version) {
    throw new Error("Unexpected registry response: missing version field");
  }
  return data.version;
}

/**
 * Spawn npm install -g jacques@<version> with inherited stdio.
 * Returns the exit code.
 */
function runNpmInstall(version: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npm",
      ["install", "-g", `${PACKAGE_NAME}@${version}`],
      {
        stdio: "inherit",
        shell: true,
      }
    );

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

/**
 * Check for and install the latest version of Jacques.
 */
export async function runUpdate(currentVersion: string): Promise<void> {
  // npx users should use npx jacques@latest instead
  if (isRunningUnderNpx()) {
    console.log(
      "Running via npx — use `npx jacques@latest` to get the newest version."
    );
    return;
  }

  console.log(`Current version: ${currentVersion}`);
  console.log("Checking npm registry for updates...\n");

  let latestVersion: string;
  try {
    latestVersion = await fetchLatestVersion();
  } catch (err) {
    const error = err as Error;
    console.error(
      `Error: Could not reach npm registry. Check your network connection.\n${error.message}`
    );
    process.exit(1);
  }

  const comparison = compareSemver(currentVersion, latestVersion);
  if (comparison >= 0) {
    console.log(`Already up to date (v${currentVersion}).`);
    return;
  }

  console.log(
    `New version available: ${currentVersion} → ${latestVersion}\n`
  );
  console.log(`Running: npm install -g ${PACKAGE_NAME}@${latestVersion}\n`);

  try {
    const exitCode = await runNpmInstall(latestVersion);
    if (exitCode === 0) {
      console.log(`\nSuccessfully updated to v${latestVersion}.`);
    } else {
      console.error(`\nnpm install exited with code ${exitCode}.`);
      if (process.platform !== "win32") {
        console.error(
          "Hint: You may need to run with sudo: sudo jacques update"
        );
      }
      process.exit(exitCode);
    }
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      console.error(
        "Error: npm not found. Make sure npm is installed and in your PATH."
      );
    } else if (error.code === "EACCES") {
      console.error("Error: Permission denied.");
      if (process.platform !== "win32") {
        console.error(
          "Hint: Try running with sudo: sudo jacques update"
        );
      }
    } else {
      console.error(`Error running npm: ${error.message}`);
    }
    process.exit(1);
  }
}
