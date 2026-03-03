import { ConfigManager } from "./core/ConfigManager.js";
import { TouhouWorld } from "./core/TouhouWorld.js";
import { logger } from "./utils/Logger.js";

// 初始化日志系统
logger.setLevel('debug');

// 可选：替换console.log为日志系统
// patchConsole();

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    logger.info('Initializing Touhou STG...');
    
    const world = new TouhouWorld('gameCanvas');
    window.configManager = new ConfigManager(world);
    window.game = world;
    window.game.init();
    
    // 防止方向键滚动页面
    window.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
            e.preventDefault();
        }
    });
    
    // 添加全局样式动画
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
            10% { opacity: 1; transform: translateX(-50%) translateY(0); }
            90% { opacity: 1; transform: translateX(-50%) translateY(0); }
            100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes scaleIn {
            from { transform: scale(0.8); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    
    logger.info('Touhou STG initialized successfully');
});
