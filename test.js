/**
 * UI 异常自动重启脚本（BASE_URL 多地址）
 * BASE_URL=http://a,http://b,http://c
 * 日志脱敏 + GitHub Actions Summary
 */

const fs = require("fs");

const rawBaseUrl = process.env.BASE_URL;
if (!rawBaseUrl) {
  throw new Error("❌ 未设置 BASE_URL 环境变量");
}

const BASE_URLS = rawBaseUrl
  .split(",")
  .map(u => u.trim())
  .filter(Boolean);

if (BASE_URLS.length === 0) {
  throw new Error("❌ BASE_URL 解析后为空");
}

const CONFIG = {
  USERNAME: process.env.USERNAME,
  PASSWORD: process.env.PASSWORD,
  CHECK_INTERVAL_MS: 30_000,
  FAIL_THRESHOLD: 3,
};

let failCount = 0;
let checkCount = 0;
const MAX_CHECK_COUNT = 3;

const summaryRows = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * URL 日志脱敏（仅用于日志和 Summary）
 */
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

/**
 * 检测单个 UI（详细日志）
 */
async function checkSingleUI(baseUrl) {
  const realUrl = `${baseUrl}:9090/ui/`;
  const logUrl = maskUrl(realUrl);

  const controller = new AbortController();
  const start = Date.now();
  const timer = setTimeout(() => controller.abort(), 5000);

  console.log(`➡️  [CHECK] GET ${logUrl}`);

  try {
    const res = await fetch(realUrl, {
      method: "GET",
      signal: controller.signal,
    });

    const cost = Date.now() - start;
    console.log(
      `⬅️  [RESP] ${logUrl} status=${res.status} ok=${res.ok} time=${cost}ms`
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

    if (err.name === "AbortError") {
      console.error(`⏱️  [TIMEOUT] ${logUrl} ${cost}ms`);
    } else {
      console.error(`💥 [ERROR] ${logUrl} ${err.message}`);
    }

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

/**
 * 轮询检测所有 BASE_URL
 */
async function checkAnyUI() {
  console.log("🔄 开始轮询 UI 地址");

  for (const baseUrl of BASE_URLS) {
    const ok = await checkSingleUI(baseUrl);
    console.log(
      `🔗 [RESULT] ${maskUrl(baseUrl)} → ${ok ? "✅ OK" : "❌ FAIL"}`
    );

    if (ok) {
      console.log(`🎯 命中可用 UI：${maskUrl(baseUrl)}`);
      return baseUrl;
    }
  }

  console.warn("🚫 本轮所有 UI 检测失败");
  return null;
}

/**
 * 登录
 */
async function login(baseUrl) {
  console.log(`🔐 登录 ${maskUrl(baseUrl)}`);

  const res = await fetch(`${baseUrl}:9090/v1/users/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Language": "zh_cn",
    },
    body: JSON.stringify({
      username: CONFIG.USERNAME,
      password: CONFIG.PASSWORD,
    }),
  });

  console.log(`⬅️  登录响应 status=${res.status}`);

  const json = await res.json().catch(() => null);

  if (!res.ok || json?.success !== 200) {
    console.error("❌ 登录失败", json);
    throw new Error("登录失败");
  }

  console.log("✅ 登录成功");
  return json.data.token.access_token;
}

/**
 * 重启系统
 */
async function restartSystem(baseUrl, token) {
  console.log(`🔁 发送重启请求 ${maskUrl(baseUrl)}`);

  try {
    const res = await fetch(`${baseUrl}:9090/v1/sys/state/restart`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Language": "zh_cn",
      },
    });

    console.log(`⬅️  重启请求已发送 status=${res.status}`);
  } catch (err) {
    console.warn("⚠️ 重启过程中连接断开（属正常）", err.message);
  }
}

/**
 * 写入 GitHub Actions Summary
 */
function writeSummary() {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) {
    console.warn("ℹ️ 非 GitHub Actions 环境，跳过 Summary");
    return;
  }

  let md = `## 🖥 UI 可用性检测汇总\n\n`;
  md += `| 地址 | 状态 | HTTP | 耗时 |\n`;
  md += `|------|------|------|------|\n`;

  for (const r of summaryRows) {
    md += `| ${r.url} | ${r.status} | ${r.http} | ${r.time}ms |\n`;
  }

  fs.appendFileSync(file, md);
}

/**
 * 主流程
 */
async function run() {
  console.log("🚀 开始 UI 多地址检测");
  console.log("🔗 BASE_URLS:", BASE_URLS.map(maskUrl).join(", "));

  while (checkCount < MAX_CHECK_COUNT) {
    checkCount++;
    console.log(`\n=========== 第 ${checkCount} 轮检测 ===========`);

    const okBaseUrl = await checkAnyUI();

    if (okBaseUrl) {
      failCount = 0;
      console.log(`✅ UI 正常（${maskUrl(okBaseUrl)}）`);
    } else {
      failCount++;
      console.warn(`⚠️ 连续失败 ${failCount}/${CONFIG.FAIL_THRESHOLD}`);

      if (failCount >= CONFIG.FAIL_THRESHOLD) {
        console.error("🔥 达到失败阈值，触发重启");

        try {
          const controlUrl = BASE_URLS[0];
          console.log(`🎛 控制入口 ${maskUrl(controlUrl)}`);

          const token = await login(controlUrl);
          await restartSystem(controlUrl, token);

          console.log("✅ 重启流程完成");
        } catch (err) {
          console.error("❌ 重启流程失败", err.message);
        }
        break;
      }
    }

    if (checkCount < MAX_CHECK_COUNT) {
      console.log(`⏳ 等待 ${CONFIG.CHECK_INTERVAL_MS / 1000}s`);
      await sleep(CONFIG.CHECK_INTERVAL_MS);
    }
  }

  writeSummary();
  console.log("\n🏁 检测结束，程序退出");
}

run().catch(err => {
  console.error("❌ 脚本异常退出", err);
});
