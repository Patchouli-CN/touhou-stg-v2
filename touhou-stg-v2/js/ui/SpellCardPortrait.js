import { logger } from "../utils/Logger.js";

/**
 * SpellCardPortrait - 符卡立绘管理器（在画布内部右侧滑入滑出）
 * 修复版：立绘在画布内部右侧滑入，滑出时隐藏
 */
export class SpellCardPortrait {
    constructor() {
        this.container = null;
        this.portraitImage = null;
        this.isVisible = false;
        this.hideTimer = null;
        this.canvas = null;
        this.canvasContainer = null;
        this.resizeObserver = null;
    }
    
    /**
     * 初始化UI元素
     */
    init() {
        // 获取游戏画布
        this.canvas = document.getElementById('gameCanvas');
        if (!this.canvas) {
            logger.error('找不到游戏画布');
            return;
        }
        
        // 获取画布的父容器
        this.canvasContainer = this.canvas.parentElement;
        
        // 确保画布容器是相对定位
        if (this.canvasContainer) {
            this.canvasContainer.style.position = 'relative';
            // 重要：容器需要overflow visible让立绘可以显示在画布内部
            this.canvasContainer.style.overflow = 'visible';
        } else {
            logger.error('找不到画布容器');
            return;
        }
        
        // 如果已经存在，先移除
        const existing = document.getElementById('spell-portrait');
        if (existing) existing.remove();
        
        // 创建一个与画布完全重叠的覆盖层
        this.createCanvasOverlay();
        
        // 监听窗口大小变化，更新位置
        window.addEventListener('resize', () => this.updatePosition());
        
        // 使用ResizeObserver监听容器大小变化
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => this.updatePosition());
            this.resizeObserver.observe(this.canvasContainer);
            this.resizeObserver.observe(this.canvas);
        }
        
        logger.debug('立绘容器已创建');
    }
    
    /**
     * 创建与画布完全重叠的覆盖层
     * 立绘在这个覆盖层内滑动，确保相对于画布定位
     */
    createCanvasOverlay() {
        // 创建覆盖层，与画布完全重叠
        this.overlay = document.createElement('div');
        this.overlay.id = 'spell-portrait-overlay';
        this.overlay.style.cssText = `
            position: absolute;
            left: ${this.canvas.offsetLeft}px;
            top: ${this.canvas.offsetTop}px;
            width: ${this.canvas.offsetWidth}px;
            height: ${this.canvas.offsetHeight}px;
            z-index: 100;
            pointer-events: none;
            overflow: hidden; /* 隐藏超出画布的部分，实现滑出隐藏效果 */
        `;
        
        // 创建立绘容器，位于覆盖层内部
        this.container = document.createElement('div');
        this.container.id = 'spell-portrait';
        this.container.style.cssText = `
            position: absolute;
            right: -300px; /* 初始隐藏在画布右侧外部 */
            top: 50%;
            transform: translateY(-50%);
            width: 280px;
            height: 450px;
            transition: right 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
            opacity: 1;
            will-change: right;
        `;
        
        // 创建图片元素
        this.portraitImage = document.createElement('img');
        this.portraitImage.id = 'portrait-img';
        this.portraitImage.src = '';
        this.portraitImage.alt = 'Boss Portrait';
        this.portraitImage.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: contain;
            filter: drop-shadow(0 0 20px rgba(231, 76, 60, 0.8));
            image-rendering: pixelated;
        `;
        
        // 添加加载失败时的占位符
        this.portraitImage.onerror = () => {
            this.portraitImage.style.display = 'none';
            this.showPlaceholder();
        };
        
        this.container.appendChild(this.portraitImage);
        
        // 添加占位符元素（当图片加载失败时显示）
        this.placeholder = document.createElement('div');
        this.placeholder.style.cssText = `
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #e74c3c, #9b59b6);
            border-radius: 10px;
            border: 3px solid #fff;
            display: none;
            justify-content: center;
            align-items: center;
            font-size: 48px;
            color: white;
            text-shadow: 0 0 10px rgba(0,0,0,0.5);
        `;
        this.placeholder.textContent = '👾';
        
        this.container.appendChild(this.placeholder);
        this.overlay.appendChild(this.container);
        this.canvasContainer.appendChild(this.overlay);
    }
    
    /**
     * 显示占位符
     */
    showPlaceholder() {
        if (this.placeholder) {
            this.portraitImage.style.display = 'none';
            this.placeholder.style.display = 'flex';
        }
    }
    
    /**
     * 隐藏占位符
     */
    hidePlaceholder() {
        if (this.placeholder) {
            this.placeholder.style.display = 'none';
            this.portraitImage.style.display = 'block';
        }
    }
    
    /**
     * 更新立绘位置（当窗口大小或布局变化时）
     */
    updatePosition() {
        if (!this.overlay || !this.canvas) return;
        
        // 更新覆盖层位置，使其始终与画布重叠
        this.overlay.style.left = `${this.canvas.offsetLeft}px`;
        this.overlay.style.top = `${this.canvas.offsetTop}px`;
        this.overlay.style.width = `${this.canvas.offsetWidth}px`;
        this.overlay.style.height = `${this.canvas.offsetHeight}px`;
        
        logger.debug('立绘位置已更新');
    }
    
    /**
     * 显示符卡立绘
     * @param {string} bossName - Boss名称
     * @param {string} spellCardName - 符卡名称
     * @param {string} portraitUrl - 立绘图片URL
     * @param {number} duration - 显示时长（秒）
     */
    show(bossName, spellCardName, portraitUrl, duration = 1) {
        if (!this.overlay) {
            logger.debug('立绘容器未初始化，正在初始化...');
            this.init();
        }
        
        if (!this.overlay || !this.canvas) {
            logger.error('立绘容器或画布不存在');
            return;
        }
        
        logger.debug('显示立绘:', spellCardName, portraitUrl);
        
        // 清除之前的定时器
        if (this.hideTimer) clearTimeout(this.hideTimer);
        
        // 更新位置（确保与画布重叠）
        this.updatePosition();
        
        // 重置图片显示
        this.hidePlaceholder();
        this.portraitImage.src = portraitUrl;
        
        // 滑入到画布内部右侧（距离右侧20px）
        this.container.style.right = '20px';
        this.isVisible = true;
        
        // 显示符卡文字
        this.showSpellCardText(spellCardName);
        
        // 设置自动隐藏
        this.hideTimer = setTimeout(() => {
            this.hide();
        }, duration * 1000);
    }
    
    /**
     * 显示符卡文字（在画布中央）
     */
    showSpellCardText(spellCardName) {
        // 获取画布容器
        const container = this.canvasContainer;
        if (!container) return;
        
        // 检查是否已存在符卡文字元素
        let spellCardEl = document.getElementById('spell-card');
        
        if (!spellCardEl) {
            spellCardEl = document.createElement('div');
            spellCardEl.id = 'spell-card';
            
            // 相对于画布容器定位，但居中显示
            spellCardEl.style.cssText = `
                position: absolute;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%) scale(0.8);
                font-size: 32px;
                font-weight: 900;
                color: #fff;
                text-shadow: 
                    0 0 20px #e74c3c,
                    0 0 40px #9b59b6,
                    2px 2px 2px rgba(0,0,0,0.8);
                z-index: 101;
                text-align: center;
                letter-spacing: 4px;
                white-space: nowrap;
                font-family: 'Noto Sans SC', '微软雅黑', sans-serif;
                background: linear-gradient(135deg, rgba(231,76,60,0.3), rgba(155,89,182,0.3));
                padding: 20px 50px;
                border-radius: 15px;
                border: 2px solid rgba(231,76,60,0.6);
                backdrop-filter: blur(5px);
                box-shadow: 0 0 40px rgba(231,76,60,0.4);
                opacity: 0;
                transition: all 0.5s ease-out;
                pointer-events: none;
            `;
            container.appendChild(spellCardEl);
        }
        
        // 更新内容
        spellCardEl.innerHTML = `
            <div style="font-size: 14px; color: rgba(255,255,255,0.9); margin-bottom: 5px;">SPELL CARD</div>
            <div style="font-size: 36px; font-weight: 900; background: linear-gradient(135deg, #e74c3c, #f39c12); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${spellCardName}</div>
        `;
        
        // 显示文字
        spellCardEl.style.opacity = '1';
        spellCardEl.style.transform = 'translate(-50%, -50%) scale(1)';
        
        // 2秒后渐隐消失
        setTimeout(() => {
            spellCardEl.style.opacity = '0';
            spellCardEl.style.transform = 'translate(-50%, -50%) scale(1.2)';
        }, 500);
    }
    
    /**
     * 隐藏符卡立绘（滑出到画布右侧外部）
     */
    hide() {
        if (!this.container) return;
        
        // 滑出到右侧外部（隐藏）
        this.container.style.right = '-300px';
        this.isVisible = false;
        
        logger.debug('立绘隐藏');
    }
    
    /**
     * 快速隐藏（立即隐藏）
     */
    quickHide() {
        if (this.hideTimer) clearTimeout(this.hideTimer);
        
        if (this.container) {
            this.container.style.right = '-300px';
        }
        
        this.isVisible = false;
        
        // 隐藏符卡文字
        const spellCardEl = document.getElementById('spell-card');
        if (spellCardEl) {
            spellCardEl.style.opacity = '0';
            spellCardEl.style.transform = 'translate(-50%, -50%) scale(0.8)';
        }
    }
    
    /**
     * 销毁立绘管理器
     */
    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        window.removeEventListener('resize', () => this.updatePosition());
        
        if (this.overlay) {
            this.overlay.remove();
        }
        
        const spellCardEl = document.getElementById('spell-card');
        if (spellCardEl) {
            spellCardEl.remove();
        }
    }
}
