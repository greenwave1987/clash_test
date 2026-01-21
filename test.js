/**
 * UI 延迟监控与重启脚本
 * - 多 URL 测试
 * - 记录延迟
 * - 全部失败时登录并重启
 * - 日志脱敏
 * - 历史数据与 README 曲线生成
 */

const fs = require("fs");
const { performance } = require("perf_hooks");
const  { fetch, ProxyAgent }  = require("undici");
// 环境变量
const BASE_URLS = (process.env.BASE_URL || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
const BASE_PORT = (process.env.BASE_PORT || "");
const CHECK_TIMEOUT = 5000; // 超时时间 5 秒
const HISTORY_FILE = "ui_history.json";
const README_FILE = "README.md";
const FAIL_THRESHOLD = 3; // 连续失败阈值
const CHECK_TIMEOUT = 3000;
const TEST_URL = "http://www.gstatic.com/generate_204";
let failCount = 0;
let checkCount = 0;
const MAX_CHECK_COUNT = 3;

// 工具函数：URL 脱敏
function maskUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.hostname.split(".");
    if (parts.length <= 2) return url;
    return `${u.protocol}//${parts[0]}.***.${parts[parts.length - 1]}`;
  } catch {
    return url;
  }
}

// 工具函数：延迟测试
/**
 * 测试通过 HTTP 代理的延迟
 * @param {string} proxyUrl 例如 http://127.0.0.1:7890
 */
async function testLatency(proxyUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT);
  const start = performance.now();

  const agent = new ProxyAgent(proxyUrl);

  try {
    await fetch(TEST_URL, {
      dispatcher: agent,
      signal: controller.signal,
    });
    return Math.round(performance.now() - start);
  } catch (e) {
    return -1;
  } finally {
    clearTimeout(timer);
  }
}

// 更新历史数据
function updateHistory(record) {
  let history = {};

  if (fs.existsSync(HISTORY_FILE)) {
    try {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    } catch {}
  }

  const now = new Date().toISOString();
  history[now] = record;

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  return history;
}

// 生成 README 曲线
function generateReadme(history) {
  const times = Object.keys(history).slice(-24);
  const urls = BASE_URLS;

  let md = `# UI 延迟监控（最近 24 次）\n\n`;
  md += `> -1 表示超时或异常\n\n`;

  // 最近一次检测表格
  md += `## 最近一次检测\n\n`;
  md += `| URL | 延迟 (ms) |\n|---|---|\n`;

  const latest = history[times[times.length - 1]];
  for (const url of urls) {
    const v = latest[url];
    md += `| ${maskUrl(url)} | ${v >= 0 ? v : "❌"} |\n`;
  }

  // Mermaid 折线图
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
      return v >= 0 ? v : -1;
    }).join(", ");
    md += "]\n";
  }

  md += "```\n";

  fs.writeFileSync(README_FILE, md);
}

// 登录函数
async function login(baseUrl) {
  const res = await fetch(`${baseUrl}:6060/v1/users/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Language": "zh_cn"
    },
    body: JSON.stringify({
      username: process.env.USERNAME,
      password: process.env.PASSWORD
    })
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success !== 200) {
    throw new Error("登录失败");
  }

  return json.data.token.access_token;
}

// 重启函数
async function restartSystem(baseUrl, token) {
  await fetch(`${baseUrl}:9090/v1/sys/state/restart`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Language": "zh_cn"
    }
  });
}

// 主运行逻辑
async function run() {
  console.log("🚀 开始 UI 延迟监控");

  const record = {};
  let allFailed = true;

  for (const url of BASE_URLS) {
    console.log(`🔍 测试 ${maskUrl(url)}`);
    const latency = await testLatency(`http://${url}:${BASE_PORT}`);
    record[url] = latency;

    if (latency >= 0) {
      console.log(`   ⏱ ${latency} ms`);
      allFailed = false;
    } else {
      console.warn(`   ❌ 超时 / 失败`);
    }

    await sleep(300); // 延迟 300 毫秒再测下一个
  }

  // 更新历史和 README
  const history = updateHistory(record);
  generateReadme(history);

  // 如果全部失败，进行登录和重启
  if (allFailed) {
    failCount++;
    console.warn(`⚠️ 全部 UI 不通 ${failCount}/${FAIL_THRESHOLD}`);

    if (failCount >= FAIL_THRESHOLD) {
      console.error("🔥 连续失败，触发登录并重启");

      try {
        const controlUrl = BASE_URLS[0];
        const token = await login(controlUrl);
        await restartSystem(controlUrl, token);

        console.log("🔁 重启指令已发送");
      } catch (err) {
        console.error("❌ 登录或重启失败", err.message);
      }

      process.exit(0); // 重启后退出
    }
  } else {
    failCount = 0; // 成功则重置失败计数
  }
}

// 辅助函数：睡眠
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 启动
run().catch(err => {
  console.error("❌ 运行失败", err);
  process.exit(1);
});
