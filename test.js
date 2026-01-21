/**
 * UI 延迟监控脚本（Node 18+ 原生）
 * - 多 URL 测试
 * - 记录延迟
 * - 生成 README 折线图
 * - 无第三方依赖，适配 GitHub Actions
 */

const fs = require("fs");
const { performance } = require("perf_hooks");

/* ================= 配置 ================= */

const BASE_URLS = (process.env.BASE_URL || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const BASE_PORT = process.env.BASE_PORT || "";
const CHECK_TIMEOUT = 5000; // ms
const HISTORY_FILE = "ui_history.json";
const README_FILE = "README.md";
const TEST_PATH = "/"; // 只测试 UI 是否响应

/* ================ 工具函数 ================ */

function maskUrl(url) {
  try {
    const u = new URL(url.startsWith("http") ? url : `http://${url}`);
    const parts = u.hostname.split(".");
    if (parts.length <= 2) return u.hostname;
    return `${parts[0]}.***.${parts[parts.length - 1]}`;
  } catch {
    return url;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* ================ 延迟测试 ================ */

async function testLatency(host, port) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT);
  const start = performance.now();

  try {
    await fetch(`http://${host}:${port}${TEST_PATH}`, {
      method: "GET",
      signal: controller.signal,
    });
    return Math.round(performance.now() - start);
  } catch {
    return -1;
  } finally {
    clearTimeout(timer);
  }
}

/* ================ 历史数据 ================ */

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

/* ================ README 生成 ================ */

function generateReadme(history) {
  const times = Object.keys(history).slice(-24);
  if (times.length === 0) return;

  let md = `# UI 延迟监控（最近 ${times.length} 次）\n\n`;
  md += `- 单位：毫秒（ms）\n`;
  md += `- \`-1\` 表示超时或异常\n\n`;

  const latest = history[times[times.length - 1]];

  md += `## 最近一次检测\n\n`;
  md += `| URL | 延迟 |\n|---|---|\n`;
  for (const url of BASE_URLS) {
    const v = latest[url];
    md += `| ${maskUrl(url)} | ${v >= 0 ? v + " ms" : "❌"} |\n`;
  }

  md += `\n## 延迟曲线\n\n`;
  md += "```mermaid\n";
  md += "xychart-beta\n";
  md += '  title "UI Latency (ms)"\n';
  md += `  x-axis [${times.map(t => `"${t.slice(11, 19)}"`).join(", ")}]\n`;
  md += `  y-axis "ms" 0 --> 3000\n`;

  for (const url of BASE_URLS) {
    md += `  line "${maskUrl(url)}" [`;
    md += times.map(t => history[t][url] ?? -1).join(", ");
    md += "]\n";
  }

  md += "```\n";

  fs.writeFileSync(README_FILE, md);
}

/* ================= 主流程 ================= */

async function run() {
  console.log("🚀 UI 延迟监控开始");

  const history = loadHistory();
  const record = {};
  const now = new Date().toISOString();

  for (const url of BASE_URLS) {
    console.log(`🔍 测试 ${maskUrl(url)}`);
    const latency = await testLatency(url, BASE_PORT);
    record[url] = latency;

    if (latency >= 0) {
      console.log(`   ⏱ ${latency} ms`);
    } else {
      console.warn(`   ❌ 超时 / 失败`);
    }

    await sleep(300);
  }

  history[now] = record;
  saveHistory(history);
  generateReadme(history);

  console.log("✅ 本次检测完成");
}

run().catch(err => {
  console.error("❌ 脚本运行失败", err);
  process.exit(1);
});
