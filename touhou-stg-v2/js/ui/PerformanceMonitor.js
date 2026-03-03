import { logger } from "../utils/Logger.js";
/*
性能监控器
*/
export class PerformanceMonitor {
    constructor(options = {}) {
        this.warningThreshold = options.warningThreshold || 50;      // 50ms (20fps)
        this.criticalThreshold = options.criticalThreshold || 100;   // 100ms (10fps)
        this.warningCooldown = options.warningCooldown || 2000;      // 防刷屏
        this.maxHistorySize = options.maxHistorySize || 60;          // 保留最近60帧
        
        // 性能数据
        this.frameTimes = [];
        this.lastWarningTime = 0;
        this.skippedFrames = 0;
        this.totalFrames = 0;
        
        // UI 元素
        this.warningElement = null;
        this.statsElement = null;
        this.isVisible = false;
        
        // 自动隐藏计时器
        this.hideTimer = null;
        
        this.initUI();
    }
    
    initUI() {
        // 创建性能警告面板（固定在右上角）
        this.warningElement = document.createElement('div');
        this.warningElement.id = 'performance-warning';
        this.warningElement.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            border-left: 4px solid #e74c3c;
            padding: 12px 20px;
            border-radius: 4px;
            color: #fff;
            font-family: 'Noto Sans SC', monospace;
            font-size: 14px;
            z-index: 1000;
            backdrop-filter: blur(5px);
            box-shadow: 0 0 20px rgba(231, 76, 60, 0.3);
            transform: translateX(400px);
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            pointer-events: none;
            min-width: 250px;
        `;
        
        this.warningElement.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                <span style="color: #e74c3c; font-size: 20px;">⚠️</span>
                <span style="font-weight: bold; color: #e74c3c;">性能下降</span>
                <span style="margin-left: auto; font-size: 12px; color: #888;" id="perf-time">--</span>
            </div>
            <div style="font-size: 12px; color: #aaa; margin-bottom: 5px;" id="perf-desc"></div>
            <div style="height: 2px; background: rgba(255,255,255,0.1);">
                <div id="perf-progress" style="width: 0%; height: 100%; background: #e74c3c;"></div>
            </div>
        `;
        
        document.body.appendChild(this.warningElement);
        
        // 创建性能统计面板（按 ` 键显示）
        this.statsElement = document.createElement('div');
        this.statsElement.id = 'performance-stats';
        this.statsElement.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: rgba(0, 0, 0, 0.9);
            border: 1px solid #9b59b6;
            padding: 15px;
            border-radius: 8px;
            color: #fff;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            z-index: 1001;
            backdrop-filter: blur(5px);
            min-width: 280px;
            display: none;
        `;
        
        this.statsElement.innerHTML = `
            <div style="margin-bottom: 10px; color: #9b59b6; font-weight: bold;">📊 性能统计</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div>平均帧时间</div><div id="stat-avg">--</div>
                <div>当前帧时间</div><div id="stat-current">--</div>
                <div>最低帧时间</div><div id="stat-min">--</div>
                <div>最高帧时间</div><div id="stat-max">--</div>
                <div>丢帧率</div><div id="stat-drop">--</div>
                <div>总帧数</div><div id="stat-total">--</div>
            </div>
            <div style="margin-top: 10px; color: #888; font-size: 10px; text-align: center;">
                按 \` 键隐藏
            </div>
        `;
        
        document.body.appendChild(this.statsElement);
        
        // 绑定快捷键
        document.addEventListener('keydown', (e) => {
            if (e.key === '`') {
                this.toggleStats();
            }
        });
    }
    
    /**
     * 记录帧时间
     * @param {number} frameTime - 当前帧耗时（毫秒）
     * @returns {boolean} 是否触发警告
     */
    recordFrame(frameTime) {
        this.frameTimes.push(frameTime);
        if (this.frameTimes.length > this.maxHistorySize) {
            this.frameTimes.shift();
        }
        this.totalFrames++;
        
        // 检查是否卡顿
        const now = Date.now();
        const timeSinceLastWarning = now - this.lastWarningTime;
        
        if (frameTime > this.warningThreshold && timeSinceLastWarning > this.warningCooldown) {
            this.skippedFrames++;
            
            const stats = this.getStats();
            const severity = frameTime > this.criticalThreshold ? 'critical' : 'warning';
            
            this.showWarning(severity, frameTime, stats.avgFrameTime);
            this.lastWarningTime = now;
            
            return true;
        }
        
        return false;
    }
    
    /**
     * 显示性能警告
     */
    showWarning(severity, currentFrameTime, avgFrameTime) {
        // 更新警告内容
        const timeEl = document.getElementById('perf-time');
        const descEl = document.getElementById('perf-desc');
        const progressEl = document.getElementById('perf-progress');
        
        if (severity === 'critical') {
            timeEl.textContent = `${currentFrameTime.toFixed(0)}ms`;
            timeEl.style.color = '#e74c3c';
            descEl.textContent = `游戏运行严重卡顿 (平均${avgFrameTime.toFixed(0)}ms)`;
            progressEl.style.background = '#e74c3c';
            
            // 改变边框颜色
            this.warningElement.style.borderLeftColor = '#e74c3c';
        } else {
            timeEl.textContent = `${currentFrameTime.toFixed(0)}ms`;
            timeEl.style.color = '#f39c12';
            descEl.textContent = `检测到帧率下降 (目标60fps)`;
            progressEl.style.background = '#f39c12';
            
            // 改变边框颜色
            this.warningElement.style.borderLeftColor = '#f39c12';
        }
        
        // 计算进度（相对于阈值）
        const progress = Math.min((currentFrameTime / this.criticalThreshold) * 100, 100);
        progressEl.style.width = `${progress}%`;
        
        // 滑入显示
        this.warningElement.style.transform = 'translateX(0)';
        this.isVisible = true;
        
        // 清除之前的定时器
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
        }
        
        // 3秒后自动隐藏
        this.hideTimer = setTimeout(() => {
            this.hideWarning();
        }, 3000);
        
        // 根据严重程度记录日志
        if (severity === 'critical') {
            logger.warn(`⚠️ 严重卡顿: ${currentFrameTime.toFixed(1)}ms (平均 ${avgFrameTime.toFixed(1)}ms)`);
        } else {
            logger.debug(`🐢 轻微卡顿: ${currentFrameTime.toFixed(1)}ms`);
        }
    }
    
    /**
     * 隐藏警告
     */
    hideWarning() {
        this.warningElement.style.transform = 'translateX(400px)';
        this.isVisible = false;
    }
    
    /**
     * 切换统计面板
     */
    toggleStats() {
        if (this.statsElement.style.display === 'none') {
            this.updateStats();
            this.statsElement.style.display = 'block';
        } else {
            this.statsElement.style.display = 'none';
        }
    }
    
    /**
     * 更新统计面板
     */
    updateStats() {
        const stats = this.getStats();
        
        document.getElementById('stat-avg').textContent = `${stats.avgFrameTime.toFixed(1)}ms`;
        document.getElementById('stat-current').textContent = `${stats.currentFrameTime.toFixed(1)}ms`;
        document.getElementById('stat-min').textContent = `${stats.minFrameTime.toFixed(1)}ms`;
        document.getElementById('stat-max').textContent = `${stats.maxFrameTime.toFixed(1)}ms`;
        document.getElementById('stat-drop').textContent = `${stats.dropRate.toFixed(1)}%`;
        document.getElementById('stat-total').textContent = stats.totalFrames;
    }
    
    /**
     * 获取性能统计
     */
    getStats() {
        const currentFrameTime = this.frameTimes[this.frameTimes.length - 1] || 0;
        const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length || 0;
        const minFrameTime = Math.min(...this.frameTimes) || 0;
        const maxFrameTime = Math.max(...this.frameTimes) || 0;
        const dropRate = (this.skippedFrames / this.totalFrames) * 100 || 0;
        
        return {
            currentFrameTime,
            avgFrameTime,
            minFrameTime,
            maxFrameTime,
            dropRate,
            totalFrames: this.totalFrames,
            skippedFrames: this.skippedFrames
        };
    }
    
    /**
     * 重置统计
     */
    reset() {
        this.frameTimes = [];
        this.skippedFrames = 0;
        this.totalFrames = 0;
        this.lastWarningTime = 0;
        this.hideWarning();
    }
}