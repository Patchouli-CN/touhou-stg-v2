/**
 * Logger - 游戏日志模块（修正版）
 * 格式：[prefix] 00:00:00.003 | INFO | msg
 * @param {string} prefix - 日志实例前缀名
 */
export class Logger {
    constructor(prefix="TouhouSTG") {
        this.level = Logger.Level.INFO;
        this.enabled = true;
        this.prefix = prefix ? prefix : 'TouhouSTG';
        this.logHistory = [];
        this.maxHistorySize = 1000;
        
        // 性能统计
        this.performanceStats = new Map();
        
        // 运行时间跟踪
        this.startTime = performance.now();  // 游戏启动时间
        this.pauseTime = 0;                  // 暂停累计时间
        this.isPaused = false;                // 是否暂停
        
        // 日志级别样式
        this.styles = {
            [Logger.Level.DEBUG]: 'color: #888;',
            [Logger.Level.INFO]: 'color: rgb(63, 153, 255);',
            [Logger.Level.WARN]: 'color: rgb(235, 178, 22); font-weight: bold;',
            [Logger.Level.ERROR]: 'color: #f00; font-weight: bold;',
            [Logger.Level.FATAL]: 'color: #f00; background: #000; font-weight: bold;'
        };
    }
    
    static Level = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        FATAL: 4,
        SILENT: 5
    };
    
    static LevelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL', 'SILENT'];
    
    /**
     * 获取格式化的运行时间
     * 格式：HH:MM:SS.mmm（时:分:秒.毫秒）
     */
    getFormattedRuntime() {
        // 计算当前运行时间（毫秒）
        let currentTime;
        if (this.isPaused) {
            currentTime = this.pauseTime;
        } else {
            currentTime = performance.now() - this.startTime;
        }
        
        // 转换为各个单位
        const totalMs = currentTime;
        const hours = Math.floor(totalMs / (3600 * 1000));
        const minutes = Math.floor((totalMs % (3600 * 1000)) / (60 * 1000));
        const seconds = Math.floor((totalMs % (60 * 1000)) / 1000);
        const milliseconds = Math.floor(totalMs % 1000);
        
        // 格式化为 HH:MM:SS.mmm
        const pad = (num, size) => String(num).padStart(size, '0');
        
        return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(milliseconds, 3)}`;
    }
    
    /**
     * 设置日志级别
     */
    setLevel(level) {
        if (typeof level === 'string') {
            const levelMap = {
                'debug': Logger.Level.DEBUG,
                'info': Logger.Level.INFO,
                'warn': Logger.Level.WARN,
                'error': Logger.Level.ERROR,
                'fatal': Logger.Level.FATAL,
                'silent': Logger.Level.SILENT
            };
            this.level = levelMap[level.toLowerCase()] ?? Logger.Level.INFO;
        } else {
            this.level = level;
        }
        return this;
    }
    
    /**
     * 启用/禁用日志
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        return this;
    }
    
    /**
     * 设置前缀
     */
    setPrefix(prefix) {
        this.prefix = prefix;
        return this;
    }
    
    /**
     * 暂停运行时间计时（例如游戏暂停时）
     */
    pause() {
        if (!this.isPaused) {
            this.pauseTime = performance.now() - this.startTime;
            this.isPaused = true;
            this.debug('Logger timer paused');
        }
    }
    
    /**
     * 恢复运行时间计时
     */
    resume() {
        if (this.isPaused) {
            // 调整开始时间，使运行时间连续
            this.startTime = performance.now() - this.pauseTime;
            this.isPaused = false;
            this.pauseTime = 0;
            this.debug('Logger timer resumed');
        }
    }
    
    /**
     * 重置运行时间计时器
     */
    resetTimer() {
        this.startTime = performance.now();
        this.pauseTime = 0;
        this.isPaused = false;
        this.debug('Logger timer reset');
    }
    
    /**
     * 内部日志方法
     */
    _log(level, message, ...args) {
        if (!this.enabled || level < this.level) return;
        
        // 获取格式化的运行时间
        const runtime = this.getFormattedRuntime();
        const levelName = Logger.LevelNames[level];
        
        // 构建新格式：[TouhouSTG] RunningTime:00:00:00.003 | INFO | msg
        const fullMessage = `[${this.prefix}] ${runtime} | ${levelName} | ${message}`;
        
        // 添加到历史
        this.logHistory.push({
            timestamp: Date.now(),
            runtime: runtime,
            level,
            message,
            args: args.map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg);
                    } catch {
                        return '[Object]';
                    }
                }
                return String(arg);
            })
        });
        
        // 限制历史大小
        if (this.logHistory.length > this.maxHistorySize) {
            this.logHistory.shift();
        }
        
        // 输出到控制台
        const style = this.styles[level] || '';
        
        switch (level) {
            case Logger.Level.DEBUG:
                console.debug(`%c${fullMessage}`, style, ...args);
                break;
            case Logger.Level.INFO:
                console.log(`%c${fullMessage}`, style, ...args);
                break;
            case Logger.Level.WARN:
                console.warn(`%c${fullMessage}`, style, ...args);
                break;
            case Logger.Level.ERROR:
            case Logger.Level.FATAL:
                console.error(`%c${fullMessage}`, style, ...args);
                break;
        }
    }
    
    debug(message, ...args) {
        this._log(Logger.Level.DEBUG, message, ...args);
    }
    
    info(message, ...args) {
        this._log(Logger.Level.INFO, message, ...args);
    }
    
    warn(message, ...args) {
        this._log(Logger.Level.WARN, message, ...args);
    }
    
    error(message, ...args) {
        this._log(Logger.Level.ERROR, message, ...args);
    }
    
    fatal(message, ...args) {
        this._log(Logger.Level.FATAL, message, ...args);
    }
    
    /**
     * 分组日志
     */
    group(label) {
        if (this.enabled && this.level <= Logger.Level.DEBUG) {
            const runtime = this.getFormattedRuntime();
            console.group(`[${this.prefix}] ${runtime} | GROUP | ${label}`);
        }
    }
    
    groupEnd() {
        if (this.enabled && this.level <= Logger.Level.DEBUG) {
            console.groupEnd();
        }
    }
    
    /**
     * 性能计时开始
     */
    time(label) {
        if (!this.enabled || this.level > Logger.Level.DEBUG) return;
        this.performanceStats.set(label, performance.now());
        this.debug(`⏱️ Timer started: ${label}`);
    }
    
    /**
     * 性能计时结束
     */
    timeEnd(label) {
        if (!this.enabled || this.level > Logger.Level.DEBUG) return;
        const start = this.performanceStats.get(label);
        if (start) {
            const duration = performance.now() - start;
            this.debug(`⏱️ Timer ended: ${label} - ${duration.toFixed(2)}ms`);
            this.performanceStats.delete(label);
            return duration;
        }
        return 0;
    }
    
    /**
     * 获取当前运行时间
     */
    getCurrentRuntime() {
        return this.getFormattedRuntime();
    }
    
    /**
     * 获取运行时间（秒）
     */
    getRuntimeSeconds() {
        if (this.isPaused) {
            return this.pauseTime / 1000;
        }
        return (performance.now() - this.startTime) / 1000;
    }
    
    /**
     * 获取日志历史
     */
    getHistory(filterLevel = null, limit = null) {
        let logs = [...this.logHistory];
        
        if (filterLevel !== null) {
            logs = logs.filter(log => log.level >= filterLevel);
        }
        
        if (limit !== null && limit > 0) {
            logs = logs.slice(-limit);
        }
        
        return logs;
    }
    
    /**
     * 清空历史
     */
    clearHistory() {
        this.logHistory = [];
    }
    
    /**
     * 导出日志为字符串
     */
    export(format = 'full') {
        return this.logHistory.map(log => {
            const time = new Date(log.timestamp).toISOString();
            const level = Logger.LevelNames[log.level];
            
            if (format === 'full') {
                return `[${time}] [${log.runtime}] [${level}] ${log.message} ${log.args.join(' ')}`;
            } else if (format === 'simple') {
                return `[${log.runtime}] [${level}] ${log.message}`;
            } else if (format === 'csv') {
                return `${time},${log.runtime},${level},${log.message},${log.args.join(' ')}`;
            }
        }).join('\n');
    }
    
    /**
     * 获取日志统计
     */
    getStats() {
        const counts = {
            debug: 0,
            info: 0,
            warn: 0,
            error: 0,
            fatal: 0
        };
        
        this.logHistory.forEach(log => {
            const levelName = Logger.LevelNames[log.level].toLowerCase();
            counts[levelName] = (counts[levelName] || 0) + 1;
        });
        
        return {
            ...counts,
            total: this.logHistory.length,
            runtime: this.getCurrentRuntime(),
            runtimeSeconds: this.getRuntimeSeconds(),
            isPaused: this.isPaused,
            level: Logger.LevelNames[this.level],
            enabled: this.enabled
        };
    }
}

// 创建全局日志实例
export const logger = new Logger();

// 为了兼容旧代码的console.log调用，可以全局替换
export function patchConsole() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalDebug = console.debug;
    
    console.log = (...args) => {
        logger.info(args[0], ...args.slice(1));
    };
    
    console.warn = (...args) => {
        logger.warn(args[0], ...args.slice(1));
    };
    
    console.error = (...args) => {
        logger.error(args[0], ...args.slice(1));
    };
    
    console.debug = (...args) => {
        logger.debug(args[0], ...args.slice(1));
    };
    
    // 返回恢复函数
    return () => {
        console.log = originalLog;
        console.warn = originalWarn;
        console.error = originalError;
        console.debug = originalDebug;
    };
}

// 在TouhouWorld.js中集成暂停/恢复功能
export function setupLoggerWithGame(game) {
    // 当游戏暂停时暂停Logger计时
    const originalTogglePause = game.togglePause;
    game.togglePause = function() {
        const result = originalTogglePause.call(this);
        
        if (this.state === 'paused') {
            logger.pause();
        } else if (this.state === 'playing') {
            logger.resume();
        }
        
        return result;
    };
    
    // 游戏开始时重置计时器
    const originalStart = game.start;
    game.start = function() {
        logger.resetTimer();
        logger.info('🎮 Game started');
        return originalStart.call(this);
    };
    
    // 游戏结束时记录
    const originalGameOver = game.gameOver;
    game.gameOver = function() {
        logger.info('💀 Game over');
        return originalGameOver.call(this);
    };
    
    logger.info('Logger integrated with game');
}