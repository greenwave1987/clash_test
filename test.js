/**
 * UI 异常自动重启脚本（最终完整版）
 * - BASE_URL 多地址
 * - 日志 URL 脱敏
 * - GitHub Actions Summary
 * - 24h 历史曲线写入 README
 *
 * 环境变量：
 * BASE_URL=http://a,http://b,http://c
 * USERNAME=xxx
 * PASSWORD=xxx
 */

const fs = require("fs");

// ==================== 基础配置 ====================

const HISTORY_FILE = "ui_history.json";
const README_FILE = "README.md";
const HISTORY_HOURS = 24;

const rawBaseUrl = process.env.BASE_URL;
if (!rawBaseUrl) throw new Error("❌ 未设置 BASE_URL");

const BASE_URLS = rawBaseUrl
  .split(",")
  .map(u => u.trim())
  .filter(Boolean);

if (BASE_URLS.length === 0) throw new Error("❌ BASE_URL 为空");

const CONFIG = {
  USERNAME: process.env.USERNAME,
  PASSWORD: process.env.PASSWORD,
  CHECK_INTERVAL_MS: 30_000,
  FAIL_THRESHOLD: 3,
};

const MAX_CHECK_COUNT = 3;

// ==================== 运行状态 ====================

let checkCount = 0;
let failCount = 0;
const summaryRows = [];

// ==================== 工具函数 ====================

const sleep = ms => new Promise(r => setTimeout(r, ms));

function maskUrl(url) {
  try {
    const u = new URL(url);
    const p = u.hostname.split(".");
    if (p.length <= 2) return url;
    return `${u.protocol}//${p[0]}.***.${p[p.length - 1]}`;
  } catch {
    return url;
  }
}

// ==================== UI 检测 ====================

async function checkSingleUI(baseUrl) {
  const realUrl = `${baseUrl}:9090/ui/`;
  const logUrl = maskUrl(realUrl);

  const controller = new AbortController();
  const start = Date.now();
  const timer = setTimeout(() => controller.abort(), 5000);

  console.log(`➡️  [CHECK] GET ${logUrl}`);

  try {
    const res = await fetch(realUrl, { signal: controller.signal });
    const cost = Date.now() - start;

    console.log(
      `⬅️  [RESP] ${logUrl} status=${res.status} ok=${res.ok} ${cost}ms`
    );

    summaryRows.push({
      url: maskUrl(baseUrl),
      status: res.ok ? "OK" : "FAIL",
      http: res.status,
      time: cost,
    });

    return res.ok;
  } catch (err) {
    const cost = Date.now() - start;

    console.error(
      err.name === "AbortError"
        ? `⏱️  [TIMEOUT] ${logUrl} ${cost}ms`
        : `💥 [ERROR] ${logUrl} ${err.message}`
    );

    summaryRows.push({
      url: maskUrl(baseUrl),
      status: "ERROR",
      http: "-",
      time: cost,
    });

    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function checkAnyUI() {
  console.log("🔄 轮询 UI 地址");

  for (const baseUrl of BASE_URLS) {
    const ok = await checkSingleUI(baseUrl);
    console.log(
      `🔗 [RESULT] ${maskUrl(baseUrl)} → ${ok ? "✅ OK" : "❌ FAIL"}`
    );
    if (ok) return baseUrl;
  }

  console.warn("🚫 本轮全部 UI 不可用");
  return null;
}

// ==================== 登录 & 重启 ====================

async function login(baseUrl) {
  console.log(`🔐 登录 ${maskUrl(baseUrl)}`);

  const res = await fetch(`${baseUrl}:9090/v1/users/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Language: "zh_cn",
    },
    body: JSON.stringify({
      username: CONFIG.USERNAME,
      password: CONFIG.PASSWORD,
    }),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || json?.success !== 200) {
    console.error("❌ 登录失败", json);
    throw new Error("login failed");
  }

  return json.data.token.access_token;
}

async function restartSystem(baseUrl, token) {
  console.log(`🔁 发送重启 ${maskUrl(baseUrl)}`);

  try {
    await fetch(`${baseUrl}:9090/v1/sys/state/restart`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Language: "zh_cn",
      },
    });
  } catch {
    console.warn("⚠️ 重启断连（正常）");
  }
}

// ==================== Summary ====================

function writeSummary() {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;

  let md = `## 🖥 UI 检测汇总\n\n`;
  md += `| 地址 | 状态 | HTTP | 耗时 |\n`;
  md += `|------|------|------|------|\n`;

  for (const r of summaryRows) {
    md += `| ${r.url} | ${r.status} | ${r.http} | ${r.time}ms |\n`;
  }

  fs.appendFileSync(file, md);
}

// ==================== 24h 历史 & README ====================

function updateHistory(isOk) {
  let history = [];

  if (fs.existsSync(HISTORY_FILE)) {
    try {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    } catch {}
  }

  const now = Date.now();
  history.push({ ts: now, ok: isOk ? 1 : 0 });

  const cutoff = now - HISTORY_HOURS * 3600 * 1000;
  history = history.filter(h => h.ts >= cutoff);

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  return history;
}

function buildMermaid(history) {
  const labels = history.map(h =>
    new Date(h.ts).toISOString().substring(11, 16)
  );
  const values = history.map(h => h.ok);

  return `
\`\`\`mermaid
xychart-beta
  title "UI 可用性（过去 24 小时）"
  x-axis [${labels.map(l => `"${l}"`).join(", ")}]
  y-axis "状态" 0 --> 1
  line [${values.join(", ")}]
\`\`\`
`;
}

function updateReadme(chart) {
  let readme = fs.existsSync(README_FILE)
    ? fs.readFileSync(README_FILE, "utf-8")
    : "# UI Monitor\n";

  const block = `
<!-- UI-STATUS-START -->
## 📈 UI 状态趋势（自动更新）

${chart}
<!-- UI-STATUS-END -->
`;

  if (readme.includes("<!-- UI-STATUS-START -->")) {
    readme = readme.replace(
      /<!-- UI-STATUS-START -->[\s\S]*?<!-- UI-STATUS-END -->/,
      block
    );
  } else {
    readme += "\n" + block;
  }

  fs.writeFileSync(README_FILE, readme);
}

// ==================== 主流程 ====================

async function run() {
  console.log("🚀 开始 UI 监控");
  console.log("🔗 BASE_URLS:", BASE_URLS.map(maskUrl).join(", "));

  let finalOk = false;

  while (checkCount < MAX_CHECK_COUNT) {
    checkCount++;
    console.log(`\n=========== 第 ${checkCount} 轮 ===========`);

    const okUrl = await checkAnyUI();
    if (okUrl) {
      finalOk = true;
      failCount = 0;
      break;
    }

    failCount++;
    console.warn(`⚠️ 连续失败 ${failCount}/${CONFIG.FAIL_THRESHOLD}`);

    if (failCount >= CONFIG.FAIL_THRESHOLD) {
      console.error("🔥 触发重启");
      try {
        const token = await login(BASE_URLS[0]);
        await restartSystem(BASE_URLS[0], token);
      } catch (e) {
        console.error("❌ 重启失败", e.message);
      }
      break;
    }

    await sleep(CONFIG.CHECK_INTERVAL_MS);
  }

  writeSummary();

  const history = updateHistory(finalOk);
  const chart = buildMermaid(history);
  updateReadme(chart);

  console.log("🏁 脚本结束");
}

run().catch(err => {
  console.error("❌ 脚本异常", err);
});
