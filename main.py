import os
import subprocess
import time
import requests
from playwright.sync_api import sync_playwright

def test_and_run():
    socks5_info = os.environ.get("SOCKS5_INFO", "")
    if not socks5_info: return

    proxy_list = socks5_info.split(',')
    
    # 尝试寻找一个可用的代理并建立隧道
    for p_str in proxy_list:
        try:
            # 解析格式 user:pass@ip:port
            auth_part, address_part = p_str.split('@')
            # gost 需要的格式是 socks5://user:pass@ip:port
            remote_proxy = f"socks5://{p_str}"
            
            print(f"尝试连接代理: {address_part} ...")

            # 1. 启动 gost 隧道 (将本地 8080 映射到远程 SOCKS5)
            # -L=:8080 指在本地 8080 端口启动 HTTP 代理
            # -F=... 指转发到远程 SOCKS5
            gost_proc = subprocess.Popen(
                ["./gost", "-L=:8080", f"-F={remote_proxy}"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            
            # 等待隧道建立
            time.sleep(2)

            # 2. 验证本地隧道是否通畅
            try:
                test_res = requests.get(
                    "https://ifconfig.me/ip", 
                    proxies={"http": "http://127.0.0.1:8080", "https": "http://127.0.0.1:8080"}, 
                    timeout=10
                )
                if test_res.status_code == 200:
                    print(f"✅ 隧道建立成功！出口 IP: {test_res.text.strip()}")
                    
                    # 3. Playwright 访问 (连接本地无需密码的 HTTP 代理)
                    run_playwright("http://127.0.0.1:8080")
                    gost_proc.terminate() # 完成后关闭
                    break
            except:
                print("❌ 该代理不可用，尝试下一个...")
                gost_proc.terminate()
        except Exception as e:
            print(f"解析出错: {e}")

def run_playwright(proxy_url):
    with sync_playwright() as p:
        # Chromium 对本地 HTTP 代理支持极好
        browser = p.chromium.launch(proxy={"server": proxy_url})
        page = browser.new_page()
        try:
            page.goto("https://httpbin.org/ip", timeout=30000)
            print("Playwright 最终通过隧道确认 IP:")
            print(page.locator("body").inner_text())
        finally:
            browser.close()

if __name__ == "__main__":
    test_and_run()
