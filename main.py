import os
import subprocess
import time
import requests
from playwright.sync_api import sync_playwright

def run_playwright_check(proxy_url):
    """使用 Playwright 访问并提取 IP 文本"""
    with sync_playwright() as p:
        # 连接本地 gost 转换后的 HTTP 代理
        browser = p.chromium.launch(proxy={"server": proxy_url})
        context = browser.new_context()
        page = context.new_page()
        
        # 定义几个常用的 IP 检测 API
        test_url = "https://api.ipify.org?format=json" 
        
        try:
            print(f"   [Playwright] 正在访问 {test_url} ...")
            page.goto(test_url, timeout=25000)
            
            # 获取页面 JSON 内容并解析
            # 例如返回: {"ip":"65.108.126.100"}
            content = page.locator("body").inner_text()
            print(f"   [Playwright] 原始返回: {content.strip()}")
            
            # 简单的验证逻辑：确保返回内容包含数字和点（IP格式）
            if "." in content:
                return True, content.strip()
            return False, "Invalid Response"
        except Exception as e:
            return False, str(e)
        finally:
            browser.close()

def test_all_proxies():
    socks5_info = os.environ.get("SOCKS5_INFO", "")
    proxy_list = [p.strip() for p in socks5_info.split(',') if p.strip()]
    
    summary = []

    for index, p_str in enumerate(proxy_list):
        node_ip = p_str.split('@')[-1]
        print(f"\n🚀 正在全面检测节点 [{index+1}/{len(proxy_list)}]: {node_ip}")
        
        # 1. 启动 Gost 隧道
        gost_proc = subprocess.Popen(
            ["./gost", "-L=:8080", f"-F=socks5://{p_str}"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        time.sleep(4) # 稍微多等一会，确保隧道稳定

        # 2. 预检 (Requests) - 快速确认
        pre_check_ip = "N/A"
        try:
            res = requests.get("https://api.ipify.org", 
                               proxies={"http": "http://127.0.0.1:8080", "https": "http://127.0.0.1:8080"}, 
                               timeout=10)
            pre_check_ip = res.text.strip()
            print(f"   [Pre-check] Requests 检测到的 IP: {pre_check_ip}")
        except:
            print("   [Pre-check] 失败，代理可能不通")

        # 3. 深度检测 (Playwright) - 模拟浏览器行为
        success, pw_result = run_playwright_check("http://127.0.0.1:8080")
        
        # 结果判定
        final_status = "✅ 成功" if success else "❌ 失败"
        summary.append({
            "node": node_ip,
            "req_ip": pre_check_ip,
            "pw_ip": pw_result if success else "Error",
            "status": final_status
        })

        # 清理
        gost_proc.terminate()
        gost_proc.wait()

    # 打印最终详细报告
    print("\n" + "="*80)
    print(f"{'节点地址':<25} | {'Requests IP':<18} | {'Playwright IP':<18} | {'状态'}")
    print("-" * 80)
    for s in summary:
        print(f"{s['node']:<25} | {s['req_ip']:<18} | {s['pw_ip']:<18} | {s['status']}")
    print("="*80)

if __name__ == "__main__":
    test_all_proxies()
