import os
import requests
from playwright.sync_api import sync_playwright

def test_and_run():
    # 1. 解析环境变量
    socks5_info = os.environ.get("SOCKS5_INFO", "")
    if not socks5_info:
        print("未找到 SOCKS5_INFO 环境变量")
        return

    # 分解多个代理
    proxy_list = socks5_info.split(',')
    valid_proxy = None

    print(f"检测到 {len(proxy_list)} 个待测试代理...")

    # 2. 验证代理是否可用
    for p_str in proxy_list:
        try:
            # 解析格式 user:pass@ip:port
            auth_part, address_part = p_str.split('@')
            username, password = auth_part.split(':')
            ip, port = address_part.split(':')
            
            proxy_url = f"socks5://{username}:{password}@{ip}:{port}"
            proxies = {
                "http": proxy_url,
                "https": proxy_url
            }

            # 使用 requests 测试连通性
            response = requests.get("https://ifconfig.me/ip", proxies=proxies, timeout=10)
            if response.status_code == 200:
                print(f"✅ 代理可用: {ip} (返回内容: {response.text.strip()})")
                valid_proxy = {
                    "server": f"socks5://{ip}:{port}",
                    "username": username,
                    "password": password
                }
                break # 找到第一个可用的就停止
        except Exception as e:
            print(f"❌ 代理不可用 ({p_str.split('@')[-1]}): {e}")

    if not valid_proxy:
        print("所有代理均不可用，程序退出。")
        return

    # 3. 将有效代理加入 Playwright
    print(f"\n正在启动 Playwright 使用代理: {valid_proxy['server']}...")
    with sync_playwright() as p:
        # 启动 Chromium
        browser = p.chromium.launch(proxy=valid_proxy)
        context = browser.new_context()
        page = context.new_page()
        
        try:
            # 访问网站验证 Playwright 中的 IP
            page.goto("https://httpbin.org/ip", timeout=30000)
            print("Playwright 验证结果:")
            print(page.locator("body").inner_text())
        except Exception as e:
            print(f"Playwright 运行出错: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    test_and_run()
