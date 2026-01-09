/**
 * UI 异常自动重启脚本
 * - 最多检测 3 次
 * - 连续失败 3 次才重启
 * - 重启后立即退出
 */

const BASE_URL = process.env.BASE_URL;

if (!BASE_URL) {
  throw new Error("❌ 未设置 BASE_URL 环境变量");
}

const CONFIG = {
  UI_URL: `${BASE_URL}/ui`,
  LOGIN_URL: `${BASE_URL}/v1/users/login`,
  RESTART_URL: `${BASE_URL}/v1/sys/state/restart`,

  USERNAME: process.env.USERNAME,
  PASSWORD: process.env.PASSWORD,

  CHECK_INTERVAL_MS: 30_000,
  FAIL_THRESHOLD: 3,
};

let failCount = 0;
let checkCount = 0;
const MAX_CHECK_COUNT = 3;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function checkUI() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(CONFIG.UI_URL, {
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

async function login() {
  const res = await fetch(CONFIG.LOGIN_URL, {
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

async function restartSystem(token) {
  try {
    await fetch(CONFIG.RESTART_URL, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Language": "zh_cn",
      },
    });
  } catch {
    // 重启时断连是正常的
  }
}

async function run() {
  console.log("🚀 开始 UI 检测（最多 3 次）");

  while (checkCount < MAX_CHECK_COUNT) {
    checkCount++;
    console.log(`🔍 第 ${checkCount} 次检测`);

    const ok = await checkUI();

    if (ok) {
      failCount = 0;
      console.log("✅ UI 正常");
    } else {
      failCount++;
      console.warn(`⚠️ UI 异常 ${failCount}/${CONFIG.FAIL_THRESHOLD}`);

      if (failCount >= CONFIG.FAIL_THRESHOLD) {
        console.error("🔥 连续异常，触发重启");

        try {
          const token = await login();
          await restartSystem(token);
          console.log("🔁 已发送重启指令");
        } catch (err) {
          console.error("❌ 重启流程失败", err.message);
        }
        break;
      }
    }

    if (checkCount < MAX_CHECK_COUNT) {
      await sleep(CONFIG.CHECK_INTERVAL_MS);
    }
  }

  console.log("🏁 检测结束，程序退出");
}

run().catch(err => {
  console.error("❌ 脚本异常退出", err);
});
