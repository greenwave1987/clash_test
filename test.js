/**
 * 代理 TCP 延迟监控（Node 18+）
 * - 测试 host:port TCP 建连延迟
 * - 多节点
 * - 历史记录
 * - README Mermaid 曲线
 */

const fs = require("fs");
const net = require("net");
const { performance } = require("perf_hooks");

/* ================= 配置 ================= */

const PROXY_HOSTS = (process.env.BASE_URL || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const PROXY_PORT = Number(process.env.BASE_PORT);
const TIMEOUT = 5000;

const HISTORY_FILE = "ui_history.json";
const README_FILE = "README.md";

/* ================= 工具 ================= */

function maskHost(host) {
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  return `${parts[0]}.***.${parts[parts.length - 1]}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* ================= TCP 延迟 ================= */

function testTcpLatency(host, port) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    const start = performance.now();
    let done = false;

    const finish = (value) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(TIMEOUT);

    socket.once("connect", () => {
      const latency = Math.round(performance.now() - start);
      finish(latency);
    });

    socket.once("timeout", () => finish(-1));
    socket.once("error", () => finish(-1));

    socket.connect(port, host);
  });
}

/* ================= 历史 ================= */

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

/* ================= README ================= */

function generateReadme(history) {
  const times = Object.keys(history).slice(-24);
  if (times.length === 0) return;

  let md = `# 代理 TCP 延迟监控（最近 ${times.length} 次）\n\n`;
  md += `- 测量：TCP connect 延迟\n`;
  md += `- 单位：ms\n`;
  md += `- -1 表示连接失败或超时\n\n`;

  const latest = history[times[times.length - 1]];

  md += `## 最近一次检测\n\n`;
  md += `| 代理 | 延迟 |\n|---|---|\n`;
  for (const host of PROXY_HOSTS) {
    const v = latest[host];
    md += `| ${maskHost(host)}:${PROXY_PORT} | ${v >= 0 ? v + " ms" : "❌"} |\n`;
  }

  md += `\n## 延迟曲线\n\n`;
  md += "```mermaid\n";
  md += "xychart-beta\n";
  md += '  title "Proxy TCP Latency (ms)"\n';
  md += `  x-axis [${times.map(t => `"${t.slice(11, 19)}"`).join(", ")}]\n`;
  md += `  y-axis "ms" 0 --> 3000\n`;

  for (const host of PROXY_HOSTS) {
    md += `  line "${maskHost(host)}" [`;
    md += times.map(t => history[t][host] ?? -1).join(", ");
    md += "]\n";
  }

  md += "```\n";

  fs.writeFileSync(README_FILE, md);
}

/* ================= 主流程 ================= */

async function run() {
  console.log("🚀 开始代理 TCP 延迟测试");

  const history = loadHistory();
  const record = {};
  const now = new Date().toISOString();

  for (const host of PROXY_HOSTS) {
    console.log(`🔍 ${host}:${PROXY_PORT}`);
    const latency = await testTcpLatency(host, PROXY_PORT);
    record[host] = latency;

    if (latency >= 0) {
      console.log(`   ⏱ ${latency} ms`);
    } else {
      console.warn(`   ❌ 连接失败`);
    }

    await sleep(300);
  }

  history[now] = record;
  saveHistory(history);
  generateReadme(history);

  console.log("✅ 测试完成");
}

run().catch(err => {
  console.error("❌ 运行失败", err);
  process.exit(1);
});
