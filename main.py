import os
import subprocess
import time
import requests
from playwright.sync_api import sync_playwright

def run_playwright_task(proxy_url):
    """执行具体的 Playwright 业务逻辑"""
    with sync_playwright() as p:
        # 此时连接的是 gost 提供的本地无密码 HTTP 代理
        browser = p.chromium.launch(proxy={"server": proxy_url})
        context = browser.new_context()
        page = context.new_page()
        try:
            page.goto("https://httpbin.org/ip", timeout=30000)
            ip_info = page.locator("body").inner_text()
            print(f"🎉 Playwright 成功执行！出口 IP 详情:\n{ip_info}")
            return True
        except Exception as e:
            print(f"❌ Playwright 访问页面失败: {e}")
            return False
        finally:
            browser.close()

def test_and_run():
    socks5_info = os.environ.get("SOCKS5_INFO", "")
    if not socks5_info:
        print("未检测到 SOCKS5_INFO 环境变量")
        return

    proxy_list = [p.strip() for p in socks5_info.split(',') if p.strip()]
    print(f"开始轮询测试，共 {len(proxy_list)} 个代理节点...")

    for index, p_str in enumerate(proxy_list):
        print(f"\n--- 正在测试节点 [{index + 1}/{len(proxy_list)}]: {p_str.split('@')[-1]} ---")
        gost_proc = None
        try:
            # 1. 启动 Gost 隧道
            # 将远程带认证的 SOCKS5 转换为本地 8080 端口的免密 HTTP 代理
            remote_url = f"socks5://{p_str}"
            gost_proc = subprocess.Popen(
                ["./gost", "-L=:8080", f"-F={remote_url}"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            
            # 预留一点时间给 gost 启动监听端口
            time.sleep(3)

            # 2. 验证隧道是否通畅 (使用 requests 快速预检)
            proxies = {"http": "http://127.0.0.1:8080", "https": "http://127.0.0.1:8080"}
            response = requests.get("https://ifconfig.me/ip", proxies=proxies, timeout=12)
            
            if response.status_code == 200:
                current_ip = response.text.strip()
                print(f"✅ 隧道预检成功，当前 IP: {current_ip}")

                # 3. 运行 Playwright
                success = run_playwright_task("http://127.0.0.1:8080")
                if success:
                    print("✅ 任务已完成，停止轮询。")
                    break
                else:
                    print("⚠️ 隧道可用但 Playwright 任务失败，尝试下一个节点...")
            else:
                print(f"❌ 代理返回状态码: {response.status_code}")

        except Exception as e:
            print(f"❌ 节点测试出错: {e}")
        finally:
            if gost_proc:
                gost_proc.terminate()
                gost_proc.wait()
                print("清理 Gost 进程。")

if __name__ == "__main__":
    test_and_run()
