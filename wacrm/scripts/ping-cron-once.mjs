import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const env = readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8");
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
};

const cron = get("CRON_SECRET");
const auto = get("AUTOMATION_CRON_SECRET");
console.log(`CRON_SECRET_SET=${Boolean(cron)}`);
console.log(`AUTOMATION_CRON_SECRET_SET=${Boolean(auto && !/^generate-/.test(auto))}`);

function hit(path, headerName, headerVal) {
  const out = execFileSync(
    "curl.exe",
    ["-sS", "-m", "20", "-H", `${headerName}: ${headerVal}`, `http://127.0.0.1:3100${path}`],
    { encoding: "utf8" },
  );
  console.log(`${path} ${out.slice(0, 240)}`);
}

if (cron) {
  hit("/api/broadcasts/cron", "Authorization", `Bearer ${cron}`);
  hit("/api/campaigns/cron", "Authorization", `Bearer ${cron}`);
  hit("/api/webhooks/cron", "Authorization", `Bearer ${cron}`);
}
if (auto && !/^generate-/.test(auto)) {
  hit("/api/automations/cron", "x-cron-secret", auto);
  hit("/api/flows/cron", "x-cron-secret", auto);
}
