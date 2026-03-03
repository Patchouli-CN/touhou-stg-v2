#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
打包服务器（不包含游戏文件）
"""

import shutil
from pathlib import Path
import PyInstaller.__main__

def build():
    base_dir = Path(__file__).parent
    
    print("=" * 50)
    print("Touhou STG 服务器打包工具")
    print("=" * 50)
    
    # 清理旧的构建文件
    for d in ['dist', 'build']:
        if (base_dir / d).exists():
            shutil.rmtree(base_dir / d)
    
    # PyInstaller参数
    args = [
        'server.py',
        '--name=TouhouSTG_Server',
        '--onefile',
        '--console',
        '--hidden-import=http.server',
        '--hidden-import=webbrowser',
        '--hidden-import=threading',
        '--clean',
        '--noconfirm',
    ]
    
    print("\n开始打包服务器...")
    PyInstaller.__main__.run(args)
    
    # 创建说明文件
    create_readme(base_dir / 'dist')
    
    print(f"\n✅ 打包完成!")
    print(f"服务器程序: {base_dir / 'dist' / 'TouhouSTG_Server.exe'}")
    print(f"说明文件: {base_dir / 'dist' / 'README.txt'}")

def create_readme(dist_dir):
    """创建说明文件"""
    readme = dist_dir / 'README.txt'
    
    content = """========================================
        Touhou STG 游戏说明
========================================

📦 文件说明：
------------
TouhouSTG_Server.exe  - 游戏服务器程序

📁 需要手动创建以下目录并放入文件：
------------------------------------
1. 创建 css/ 目录
   - 放入 style.css

2. 创建 js/ 目录
   - 放入所有JS文件（保持原有目录结构）
   js/
   ├── core/
   ├── entities/
   ├── danmaku/
   ├── ui/
   └── utils/

3. 创建 Boss/ 目录
   - 放入Boss配置文件
   Boss/
   ├── index.json
   └── satori/
       ├── meta.json
       ├── satori.json
       ├── anim.json
       ├── *.png
       └── *.wav

4. 放入 index.html

🚀 运行方法：
------------
1. 双击 TouhouSTG_Server.exe
2. 浏览器自动打开 http://127.0.0.1:9123
3. 按 Ctrl+C 关闭服务器

⚠️ 注意：
-------
- 所有文件必须放在和exe相同的目录下
- 确保目录结构正确
- 端口9123不能被占用

问题反馈：...
========================================
"""
    
    with open(readme, 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    build()