/**
 * UI 延迟监控 & 曲线生成（GitHub Actions 版）
 */

const fs = require("fs");
const { performance } = require("perf_hooks");

const BASE_URLS = (process.env.BASE_URL || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const CHECK_TIMEOUT = 5000;
const HISTORY_FILE = "ui_history.json";
const README_FILE = "README.md";

/* ================= 工具函数 ================= */

function maskUrl(url) {
  return url.replace(/(https?:\/\/)(.{3}).+?(.{3})(\/?)/, "$1$2***$3$4");
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testLatency(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT);
  const start = performance.now();

  try {
    await fetch(url, {
      method: "GET",
      mode: "no-cors",
      signal: controller.signal
    });
    return Math.round(performance.now() - start);
  } catch {
    return -1;
  } finally {
    clearTimeout(timer);
  }
}

/* ================= 主逻辑 ================= */

async function run() {
  if (!BASE_URLS.length) {
    console.error("❌ 未设置 BASE_URL");
    process.exit(1);
  }

  console.log("📡 开始检测所有网址延迟");
  const now = new Date().toISOString();
  const record = {};

  for (const url of BASE_URLS) {
    console.log(`🔍 测试 ${maskUrl(url)}`);
    const latency = await testLatency(url);
    record[url] = latency;

    if (latency >= 0) {
      console.log(`   ⏱ ${latency} ms`);
    } else {
      console.warn(`   ❌ 超时 / 失败`);
    }

    await sleep(300);
  }

  /* ===== 读取 & 写入历史 ===== */

  let history = {};
  if (fs.existsSync(HISTORY_FILE)) {
    history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  }

  history[now] = record;

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

  generateReadme(history);
  console.log("✅ README & 历史数据已更新");
}

/* ================= README 曲线 ================= */

function generateReadme(history) {
  const times = Object.keys(history).slice(-24);
  const urls = BASE_URLS;

  let md = `# UI 延迟监控（最近 24 次）\n\n`;
  md += `> -1 表示超时 / 异常\n\n`;

  /* 表格汇总 */
  md += `## 最近一次检测\n\n`;
  md += `| URL | 延迟 (ms) |\n|---|---|\n`;

  const latest = history[times[times.length - 1]];
  for (const url of urls) {
    const v = latest[url];
    md += `| ${maskUrl(url)} | ${v >= 0 ? v : "❌"} |\n`;
  }

  /* Mermaid 折线图 */
  md += `\n## 延迟曲线\n\n`;
  md += "```mermaid\n";
  md += "xychart-beta\n";
  md += '  title "UI Latency (ms)"\n';
  md += `  x-axis [${times.map(t => `"${t.slice(11, 19)}"`).join(", ")}]\n`;
  md += `  y-axis "ms" 0 --> 3000\n`;

  for (const url of urls) {
    md += `  line "${maskUrl(url)}" [`;
    md += times.map(t => {
      const v = history[t][url];
      return v >= 0 ? v : "null";
    }).join(", ");
    md += "]\n";
  }

  md += "```\n";

  fs.writeFileSync(README_FILE, md);
}

/* ================= 启动 ================= */

run().catch(err => {
  console.error("❌ 运行失败", err);
  process.exit(1);
});
