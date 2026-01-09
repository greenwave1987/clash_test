/**
 * UI 异常自动重启脚本（只检测 3 次后停止）
 * 每次检测间隔 CHECK_INTERVAL_MS
 * 检测 3 次后无论结果如何直接退出
 */
base_url=process.env.BASE_URL;
const CONFIG = {
  UI_URL: `{base_url}/ui`,
  LOGIN_URL: `{base_url}/v1/users/login`,
  RESTART_URL: `{base_url}/v1/sys/state/restart`,

  USERNAME: process.env.USERNAME,
  PASSWORD: process.env.PASSWORD,

  CHECK_INTERVAL_MS: 30_000, // 每次检测间隔
  FAIL_THRESHOLD: 3,         // 连续失败 3 次才重启
};

let failCount = 0;
let checkCount = 0;
const MAX_CHECK_COUNT = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkUI() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    await fetch(CONFIG.UI_URL, {
      method: "GET",
      mode: "no-cors", // 浏览器跨域检测
      signal: controller.signal,
    });

    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

async function login() {
  const res = await fetch(CONFIG.LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Language": "zh_cn",
    },
    credentials: "include",
    body: JSON.stringify({
      username: CONFIG.USERNAME,
      password: CONFIG.PASSWORD,
    }),
  });

  const json = await res.json();
  if (!res.ok || json.success !== 200) {
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
      credentials: "include",
    });
  } catch {
    // 重启时断连是正常的
  }
}

async function run() {
  console.log("开始 UI 检测（最多 3 次）");

  while (checkCount < MAX_CHECK_COUNT) {
    checkCount++;
    console.log(`第 ${checkCount} 次检测`);

    const ok = await checkUI();

    if (ok) {
      failCount = 0;
      console.log("[OK] UI 正常");
    } else {
      failCount++;
      console.warn(`[WARN] UI 异常 ${failCount}/${CONFIG.FAIL_THRESHOLD}`);

      if (failCount >= CONFIG.FAIL_THRESHOLD) {
        console.error("连续异常，触发重启");

        try {
          const token = await login();
          await restartSystem(token);
          console.log("已发送重启指令");
        } catch (err) {
          console.error("重启流程失败", err);
        }

        break; // 已重启，直接结束程序
      }
    }

    if (checkCount < MAX_CHECK_COUNT) {
      await sleep(CONFIG.CHECK_INTERVAL_MS);
    }
  }

  console.log("检测结束，程序退出");
}

run().catch(err => {
  console.error(err);
});
