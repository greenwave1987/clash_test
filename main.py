import os
import requests
from playwright.sync_api import sync_playwright

def test_and_run():
    socks5_info = os.environ.get("SOCKS5_INFO", "")
    if not socks5_info:
        print("未找到 SOCKS5_INFO 环境变量")
        return

    proxy_list = socks5_info.split(',')
    valid_proxy_config = None

    for p_str in proxy_list:
        try:
            auth_part, address_part = p_str.split('@')
            username, password = auth_part.split(':')
            ip, port = address_part.split(':')
            
            proxy_url = f"socks5://{username}:{password}@{ip}:{port}"
            # 测试连通性
            response = requests.get("https://ifconfig.me/ip", proxies={"http": proxy_url, "https": proxy_url}, timeout=10)
            
            if response.status_code == 200:
                print(f"✅ 代理验证通过: {ip}")
                # 核心改变：拆分配置
                valid_proxy_config = {
                    "server": f"socks5://{ip}:{port}", # launch 用这个
                    "username": username,              # new_context 用这个
                    "password": password
                }
                break
        except Exception as e:
            print(f"❌ 代理跳过 ({p_str.split('@')[-1]}): {e}")

    if not valid_proxy_config:
        return

    with sync_playwright() as p:
        # 1. 启动浏览器时只传 server 地址
        browser = p.chromium.launch(proxy={
            "server": valid_proxy_config["server"]
        })
        
        # 2. 在创建上下文时传入用户名和密码
        # Playwright 会在这里通过 CDP 协议拦截并处理 SOCKS5 认证
        context = browser.new_context(proxy={
            "server": valid_proxy_config["server"],
            "username": valid_proxy_config["username"],
            "password": valid_proxy_config["password"]
        })
        
        page = context.new_page()
        try:
            page.goto("https://httpbin.org/ip", timeout=30000)
            print("\nPlaywright 最终出口 IP 验证:")
            print(page.locator("body").inner_text())
        except Exception as e:
            print(f"Playwright 访问失败: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    test_and_run()
