#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Touhou STG 服务器 (独立版)
只打包服务器，代码文件单独提供
"""

import os
import sys
import webbrowser
import threading
import time
from http.server import SimpleHTTPRequestHandler, HTTPServer
from pathlib import Path

# 获取程序所在目录
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).parent

class CORSHTTPRequestHandler(SimpleHTTPRequestHandler):
    """添加CORS支持"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)
    
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
    
    def do_GET(self):
        if self.path == '/':
            self.path = '/index.html'
        print(f"[{self.client_address[0]}] {self.path}")
        return super().do_GET()

def open_browser(port):
    time.sleep(1.5)
    webbrowser.open(f'http://127.0.0.1:{port}')

def main():
    print("=" * 50)
    print("     Touhou STG 服务器")
    print("=" * 50)
    print(f"工作目录: {BASE_DIR}")
    print("\n请将游戏文件放在此目录下:")
    print("  - index.html")
    print("  - css/")
    print("  - js/")
    print("  - Boss/")
    print("-" * 50)
    
    port = 9123
    try:
        server = HTTPServer(("", port), CORSHTTPRequestHandler)
        print(f"\n✅ 服务器运行在: http://127.0.0.1:{port}")
        print("按 Ctrl+C 停止服务器")
        print("-" * 50)
        
        threading.Thread(target=open_browser, args=(port,), daemon=True).start()
        server.serve_forever()
        
    except KeyboardInterrupt:
        print("\n\n👋 服务器已停止")
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        input("按回车键退出...")

if __name__ == "__main__":
    main()