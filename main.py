import os
import subprocess
import time
import requests
from playwright.sync_api import sync_playwright

def run_playwright_task(proxy_url):
    """执行具体的 Playwright 业务逻辑"""
    with sync_playwright() as p:
        # 连接 gost 提供的本地无密码 HTTP 代理
        try:
            browser = p.chromium.launch(proxy={"server": proxy_url})
            context = browser.new_context()
            page = context.new_page()
            page.goto("https://httpbin.org/ip", timeout=20000)
            ip_info = page.locator("body").inner_text()
            print(f"   [Playwright] 访问成功，出口 IP 详情: {ip_info.strip()}")
            browser.close()
            return True
        except Exception as e:
            print(f"   [Playwright] 访问失败: {e}")
            return False

def test_all_proxies():
    socks5_info = os.environ.get("SOCKS5_INFO", "")
    if not socks5_info:
        print("未检测到 SOCKS5_INFO 环境变量")
        return

    proxy_list = [p.strip() for p in socks5_info.split(',') if p.strip()]
    print(f"🚀 开始全量测试，共 {len(proxy_list)} 个代理节点...\n")

    results = []

    for index, p_str in enumerate(proxy_list):
        node_name = p_str.split('@')[-1]
        print(f"▶ 正在测试节点 [{index + 1}/{len(proxy_list)}]: {node_name}")
        
        gost_proc = None
        status = "Failed"
        
        try:
            # 1. 启动 Gost 隧道
            remote_url = f"socks5://{p_str}"
            gost_proc = subprocess.Popen(
                ["./gost", "-L=:8080", f"-F={remote_url}"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            
            # 预留时间给端口监听
            time.sleep(3)

            # 2. 预检 (Requests)
            proxies = {"http": "http://127.0.0.1:8080", "https": "http://127.0.0.1:8080"}
            try:
                response = requests.get("https://ifconfig.me/ip", proxies=proxies, timeout=10)
                if response.status_code == 200:
                    print(f"   [Pre-check] 隧道通畅，IP: {response.text.strip()}")
                    
                    # 3. 运行 Playwright 验证
                    if run_playwright_task("http://127.0.0.1:8080"):
                        status = "Success"
                    else:
                        status = "Playwright Failed"
                else:
                    status = f"HTTP {response.status_code}"
            except Exception as e:
                status = "Connection Timeout/Error"
                print(f"   [Pre-check] 失败: {e}")

        except Exception as e:
            status = f"Error: {str(e)}"
        finally:
            if gost_proc:
                gost_proc.terminate()
                gost_proc.wait()
            
            results.append({"node": node_name, "status": status})
            print(f"--- 节点测试结束，状态: {status} ---\n")

    # 4. 打印最终汇总报告
    print("="*50)
    print(f"{'代理节点 (IP:Port)':<30} | {'测试结果':<15}")
    print("-"*50)
    for res in results:
        print(f"{res['node']:<30} | {res['status']:<15}")
    print("="*50)

if __name__ == "__main__":
    test_all_proxies()
