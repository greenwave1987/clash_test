/**
 * UI 异常自动重启脚本（BASE_URL 环境变量多地址）
 * BASE_URL=http://a,http://b,http://c
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

async function checkSingleUI(baseUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${baseUrl}/ui/#/setup`, {
      method: "GET",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 轮询检测所有 BASE_URL
 * 任意一个成功即返回该 baseUrl
 */
async function checkAnyUI() {
  for (const baseUrl of BASE_URLS) {
    const ok = await checkSingleUI(baseUrl);
    console.log(`🔗 ${baseUrl} → ${ok ? "OK" : "FAIL"}`);
    if (ok) return baseUrl;
  }
  return null;
}

async function login(baseUrl) {
  const res = await fetch(`${baseUrl}/v1/users/login`, {
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

  const json = await res.json();
  if (!res.ok || json?.success !== 200) {
    throw new Error("登录失败");
  }
  return json.data.token.access_token;
}

async function restartSystem(baseUrl, token) {
  try {
    await fetch(`${baseUrl}/v1/sys/state/restart`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Language": "zh_cn",
      },
    });
  } catch {
    // 重启时断连属正常
  }
}

async function run() {
  console.log("🚀 开始 UI 多地址检测");
  console.log("🔗 BASE_URLS =", BASE_URLS.join(", "));

  while (checkCount < MAX_CHECK_COUNT) {
    checkCount++;
    console.log(`\n🔍 第 ${checkCount} 轮检测`);

    const okBaseUrl = await checkAnyUI();

    if (okBaseUrl) {
      failCount = 0;
      console.log(`✅ UI 正常（${okBaseUrl}）`);
    } else {
      failCount++;
      console.warn(`⚠️ 全部 UI 不可用 ${failCount}/${CONFIG.FAIL_THRESHOLD}`);

      if (failCount >= CONFIG.FAIL_THRESHOLD) {
        console.error("🔥 连续失败，触发重启");

        try {
          // 默认使用第一个 BASE_URL 作为控制入口
          const controlUrl = BASE_URLS[0];
          const token = await login(controlUrl);
          await restartSystem(controlUrl, token);
          console.log("🔁 已发送重启指令");
        } catch (err) {
          console.error("❌ 重启失败", err.message);
        }
        break;
      }
    }

    if (checkCount < MAX_CHECK_COUNT) {
      await sleep(CONFIG.CHECK_INTERVAL_MS);
    }
  }

  console.log("\n🏁 检测结束，程序退出");
}

run().catch(err => {
  console.error("❌ 脚本异常", err);
});
