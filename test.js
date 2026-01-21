/**
 * 代理 TCP + TLS 延迟监控
 * - 先检测代理可用性
 * - TCP connect + TLS handshake 延迟
 * - 历史记录 + README
 * - 连续 N 次失败告警
 */

const fs = require("fs");
const net = require("net");
const tls = require("tls");
const { performance } = require("perf_hooks");
const { fetch } = require("undici");
const { SocksProxyAgent } = require("socks-proxy-agent");
const { HttpsProxyAgent } = require("http-proxy-agent");

const TIMEOUT = 5000;
const FAIL_THRESHOLD = 3;
const HISTORY_FILE = "ui_history.json";
const README_FILE = "README.md";

/* ================= 配置 ================= */

// BASE_URL: host1,host2,...
// BASE_PORT: 端口号
// PROXY_TYPE: socks5 或 http
const HOSTS = (process.env.BASE_URL || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
const PORT = Number(process.env.BASE_PORT);
const PROXY_TYPE = process.env.PROXY_TYPE || "socks5"; // 默认 socks5

/* ================= 工具 ================= */

function maskHost(host) {
  const p = host.split(".");
  return p.length <= 2 ? host : `${p[0]}.***.${p[p.length - 1]}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); }
  catch { return {}; }
}

function saveHistory(h) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(h, null, 2));
}

function isContinuouslyFailed(history, host) {
  const times = Object.keys(history).slice(-FAIL_THRESHOLD);
  if (times.length < FAIL_THRESHOLD) return false;
  return times.every(t => history[t][host] === -1);
}

function generateReadme(history) {
  const times = Object.keys(history).slice(-24);
  if (!times.length) return;

  let md = `# 代理 TCP + TLS 延迟监控\n\n`;
  md += `- 单位：ms\n- -1 表示连接或 TLS 失败\n\n`;

  const latest = history[times[times.length - 1]];
  md += `## 最近一次检测\n\n| 代理 | 延迟 |\n|---|---|\n`;

  for (const h of HOSTS) {
    const v = latest[h];
    md += `| ${maskHost(h)}:${PORT} | ${v >= 0 ? v + " ms" : "❌"} |\n`;
  }

  md += `\n## 延迟曲线\n\n\`\`\`mermaid\n`;
  md += `xychart-beta\n`;
  md += `  title "Proxy TCP + TLS Latency"\n`;
  md += `  x-axis [${times.map(t => `"${t.slice(11, 19)}"`).join(", ")}]\n`;
  md += `  y-axis "ms" 0 --> 3000\n`;

  for (const h of HOSTS) {
    md += `  line "${maskHost(h)}" [${times.map(t => history[t][h] ?? -1).join(", ")}]\n`;
  }

  md += `\`\`\`\n`;
  fs.writeFileSync(README_FILE, md);
}

/* ================= 代理可用性 ================= */

async function testProxy(host, port, type = "socks5") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  let agent;
  const addr = `${host}:${port}`;
  if (type === "socks5") agent = new SocksProxyAgent(`${type}://${addr}`);
  else agent = new HttpsProxyAgent(`http://${addr}`);

  try {
    const res = await fetch("https://www.google.com", { dispatcher: agent, signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/* ================= TCP + TLS ================= */

function testTcpTlsLatency(host, port) {
  return new Promise(resolve => {
    const start = performance.now();
    let done = false;

    const finish = v => {
      if (done) return;
      done = true;
      resolve(v);
    };

    const socket = net.connect({ host, port, timeout: TIMEOUT }, () => {
      const tlsSocket = tls.connect({
        socket,
        servername: host,
        rejectUnauthorized: false,
        timeout: TIMEOUT,
      });

      tlsSocket.once("secureConnect", () => {
        const latency = Math.round(performance.now() - start);
        tlsSocket.destroy();
        finish(latency);
      });

      tlsSocket.once("error", () => finish(-1));
      tlsSocket.once("timeout", () => finish(-1));
    });

    socket.once("error", () => finish(-1));
    socket.once("timeout", () => finish(-1));
  });
}

/* ================= 主流程 ================= */

async function run() {
  console.log("🚀 代理 TCP + TLS 延迟检测开始");

  const history = loadHistory();
  const record = {};
  const now = new Date().toISOString();

  for (const host of HOSTS) {
    console.log(`\n🔍 测试代理 ${host}:${PORT}`);

    const ok = await testProxy(host, PORT, PROXY_TYPE);
    if (!ok) {
      console.log(`   ❌ 代理不可用`);
      record[host] = -1;
      continue;
    }
    console.log(`   ✅ 代理可用，开始测 TCP+TLS 延迟`);

    const latency = await testTcpTlsLatency(host, PORT);
    record[host] = latency;
    console.log(latency >= 0 ? `   ⏱ ${latency} ms` : `   ❌ TCP/TLS 失败`);
    await sleep(300);
  }

  history[now] = record;
  saveHistory(history);
  generateReadme(history);

  for (const host of HOSTS) {
    if (isContinuouslyFailed(history, host)) {
      console.error(`🚨 ${host}:${PORT} 连续 ${FAIL_THRESHOLD} 次失败`);
      process.exitCode = 2;
    }
  }

  console.log("\n✅ 检测完成");
}

run().catch(err => {
  console.error("❌ 运行失败", err);
  process.exit(1);
});
