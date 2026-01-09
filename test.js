/**
 * UI 异常自动重启脚本（BASE_URL 环境变量多地址）
 * BASE_URL=http://a,http://b,http://c
 * 仅增强日志，不修改任何请求地址
 */

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * 检测单个 UI（详细日志）
 */
async function checkSingleUI(baseUrl) {
  const url = `${baseUrl}:9090/ui/#/setup`;
  const controller = new AbortController();
  const start = Date.now();
  const timer = setTimeout(() => controller.abort(), 5000);

  console.log(`➡️  [CHECK] 请求 ${url}`);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    const cost = Date.now() - start;
    console.log(
      `⬅️  [RESP] ${baseUrl} status=${res.status} ok=${res.ok} time=${cost}ms`
    );

    return res.ok;
  } catch (err) {
    const cost = Date.now() - start;

    if (err.name === "AbortError") {
      console.error(
        `⏱️  [TIMEOUT] ${baseUrl} 超时 ${cost}ms`
      );
    } else {
      console.error(
        `💥 [ERROR] ${baseUrl} ${err.message}`
      );
    }

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
      `🔗 [RESULT] ${baseUrl} → ${ok ? "✅ OK" : "❌ FAIL"}`
    );

    if (ok) {
      console.log(`🎯 命中可用 UI：${baseUrl}`);
      return baseUrl;
    }
  }

  console.warn("🚫 本轮所有 UI 检测失败");
  return null;
}

async function login(baseUrl) {
  console.log(`🔐 开始登录 ${baseUrl}`);

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

  console.log("✅ 登录成功，获取 token");
  return json.data.token.access_token;
}

async function restartSystem(baseUrl, token) {
  console.log(`🔁 发送重启请求 ${baseUrl}`);

  try {
    const res = await fetch(`${baseUrl}:9090/v1/sys/state/restart`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Language": "zh_cn",
      },
    });

    console.log(
      `⬅️  重启请求已发送 status=${res.status}`
    );
  } catch (err) {
    console.warn(
      "⚠️ 重启过程中连接断开（属正常）",
      err.message
    );
  }
}

async function run() {
  console.log("🚀 开始 UI 多地址检测");
  console.log("🔗 BASE_URLS:", BASE_URLS);

  while (checkCount < MAX_CHECK_COUNT) {
    checkCount++;
    console.log(
      `\n================ 第 ${checkCount} 轮检测 ================`
    );

    const okBaseUrl = await checkAnyUI();

    if (okBaseUrl) {
      failCount = 0;
      console.log(`✅ UI 正常（${okBaseUrl}）`);
    } else {
      failCount++;
      console.warn(
        `⚠️ 连续失败 ${failCount}/${CONFIG.FAIL_THRESHOLD}`
      );

      if (failCount >= CONFIG.FAIL_THRESHOLD) {
        console.error("🔥 达到失败阈值，准备重启");

        try {
          const controlUrl = BASE_URLS[0];
          console.log(`🎛 使用控制入口 ${controlUrl}`);

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
      console.log(
        `⏳ 等待 ${CONFIG.CHECK_INTERVAL_MS / 1000}s 后进入下一轮`
      );
      await sleep(CONFIG.CHECK_INTERVAL_MS);
    }
  }

  console.log("\n🏁 检测结束，程序退出");
}

run().catch(err => {
  console.error("❌ 脚本异常退出", err);
});
