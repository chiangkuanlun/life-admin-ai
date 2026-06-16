import { readFile } from "node:fs/promises";

const requiredFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "assets/hero-life-admin.svg",
  ".nojekyll",
];

const bannedUiTerms = ["Demo", "MVP", "測試"];
const requiredUiMarkers = [
  "Platform Console",
  "authEmailInput",
  "registerButton",
  "provider-button line",
  "provider-button google",
  "provider-button apple",
  "llmEndpointInput",
  "llmKeyInput",
  "caseNameInput",
  "reminderLeadInput",
  "priorityInput",
  "archiveCaseButton",
  "解析歷史",
  "匯出 JSON",
];

async function main() {
  const contents = new Map();
  for (const file of requiredFiles) {
    contents.set(file, await readFile(file, "utf8"));
  }

  const html = contents.get("index.html");
  for (const term of bannedUiTerms) {
    if (html.includes(term)) {
      throw new Error(`UI still contains non-production wording: ${term}`);
    }
  }

  for (const marker of requiredUiMarkers) {
    if (!html.includes(marker) && !contents.get("app.js").includes(marker)) {
      throw new Error(`Missing platform marker: ${marker}`);
    }
  }

  if (!html.includes('<meta charset="utf-8"')) {
    throw new Error("Missing UTF-8 meta tag");
  }

  if (!contents.get("app.js").includes("localStorage")) {
    throw new Error("History persistence is not wired");
  }

  for (const marker of ["userScopedKey", "analyzeWithLlm", "Authorization: `Bearer", "loadActiveUser"]) {
    if (!contents.get("app.js").includes(marker)) {
      throw new Error(`Missing application wiring: ${marker}`);
    }
  }

  if (!contents.get("styles.css").includes("@media (max-width: 760px)")) {
    throw new Error("Mobile responsive stylesheet check failed");
  }

  console.log("Platform packaging checks passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
