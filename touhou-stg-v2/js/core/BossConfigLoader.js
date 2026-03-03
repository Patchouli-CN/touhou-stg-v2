import { logger } from "../utils/Logger.js";

/**
 * BossConfigLoader.js - Boss配置文件加载器（优化版）
 */
export class BossConfigLoader {
    constructor(baseUrl = 'Boss/') {
        this.baseUrl = baseUrl;
        this.currentBoss = null;
        this.bossList = [];
        
        // 缓存
        this.configCache = new Map();
        this.scriptCache = new Map();
        this.animCache = new Map();
    }
    
    /**
     * 扫描并获取所有可用的Boss列表
     */
    async scanBosses() {
        try {
            const response = await fetch(this.baseUrl + 'index.json');
            if (response.ok) {
                const data = await response.json();
                this.bossList = data.bosses || [];
                logger.info(`Scanned ${this.bossList.length} bosses`);
            }
        } catch (error) {
            logger.warn('Failed to scan bosses, using default list:', error);
            return [];
        }
        return this.bossList;
    }
    
    /**
     * 加载指定Boss的元信息
     */
    async loadBoss(bossPath) {
        // 确保路径以/结尾
        if (!bossPath.endsWith('/')) bossPath += '/';
        
        try {
            // 加载meta.json
            const metaUrl = bossPath + 'meta.json';
            const metaResponse = await fetch(metaUrl);
            if (!metaResponse.ok) {
                // Boss 是游戏核心，加载失败游戏无法进行
                logger.fatal(`Failed to load boss meta.json from ${metaUrl}`, {
                    status: metaResponse.status,
                    path: bossPath
                });
                throw new Error(`Cannot load boss: ${bossPath}`);
            }
            const metaData = await metaResponse.json();
            
            logger.debug('Loaded meta data:', metaData);
            
            // 构建完整的Boss配置
            const bossConfig = {
                path: bossPath,
                meta: metaData,
                danmakuScriptPath: bossPath + (metaData.danmaku_script_path || 'satori.json'),
                animPath: bossPath + (metaData.action_anim_path || 'anim.json'),
                musicPath: bossPath + (metaData.music_path || 'default.wav'),
                name: metaData.name || 'Unknown',
                title: metaData.title || '',
                version: metaData.version || '1.0.0',
                serverBaseUrl: metaData.server_base_url || '',
                conversion: metaData.conversion || []
            };
            
            this.currentBoss = bossConfig;
            
            // 预加载弹幕脚本
            await this.loadDanmakuScript(bossConfig.danmakuScriptPath);
            
            // 预加载动画配置
            await this.loadAnimConfig(bossConfig.animPath);
            
            logger.info('Boss loaded:', bossConfig.name);
            return bossConfig;
            
        } catch (error) {
            logger.error('Failed to load boss:', error);
            return null;
        }
    }
    
    /**
     * 加载弹幕脚本
     */
    async loadDanmakuScript(scriptPath) {
        if (this.scriptCache.has(scriptPath)) {
            return this.scriptCache.get(scriptPath);
        }
        
        try {
            const response = await fetch(scriptPath);
            if (!response.ok) {
                throw new Error(`Failed to load danmaku script from ${scriptPath}`);
            }
            
            const script = await response.json();
            this.scriptCache.set(scriptPath, script);
            logger.debug('Loaded danmaku script:', scriptPath);
            return script;
            
        } catch (error) {
            logger.error('Failed to load danmaku script:', error);
            return null;
        }
    }
    
    /**
     * 加载动画配置
     */
    async loadAnimConfig(animPath) {
        if (this.animCache.has(animPath)) {
            return this.animCache.get(animPath);
        }
        
        try {
            const response = await fetch(animPath);
            if (!response.ok) {
                throw new Error(`Failed to load anim config from ${animPath}`);
            }
            
            const anim = await response.json();
            this.animCache.set(animPath, anim);
            logger.debug('Loaded anim config:', animPath);
            return anim;
            
        } catch (error) {
            logger.error('Failed to load anim config:', error);
            return null;
        }
    }
    
    /**
     * 获取当前Boss的弹幕脚本
     */
    getCurrentDanmakuScript() {
        if (!this.currentBoss) return null;
        return this.scriptCache.get(this.currentBoss.danmakuScriptPath);
    }
    
    /**
     * 获取当前Boss的动画配置
     */
    getCurrentAnimConfig() {
        if (!this.currentBoss) return null;
        return this.animCache.get(this.currentBoss.animPath);
    }
    
    /**
     * 获取对话内容
     */
    getConversation(index = 0) {
        if (!this.currentBoss) return null;
        const conv = this.currentBoss.conversion;
        if (conv && conv[index]) {
            return conv[index];
        }
        return null;
    }
}
