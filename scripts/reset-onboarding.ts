import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const settingsPath = join(
  homedir(),
  "Library",
  "Application Support",
  "com.toycrane.arrowly",
  "settings.json",
);

let raw: string;
try {
  raw = await readFile(settingsPath, "utf8");
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "ENOENT") {
    console.log("No Arrowly settings found; starting as a new user.");
    process.exit(0);
  }
  throw error;
}

let settings: unknown;
try {
  settings = JSON.parse(raw);
} catch {
  console.error(`Refusing to overwrite invalid settings: ${settingsPath}`);
  process.exit(1);
}

if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
  console.error(`Refusing to overwrite malformed settings: ${settingsPath}`);
  process.exit(1);
}

delete (settings as Record<string, unknown>).onboardingDone;
await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
console.log(`Reset onboarding state: ${settingsPath}`);
