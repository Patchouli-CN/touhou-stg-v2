import { Entity } from "./Entity.js";
import { Vector2 } from "../utils/Vector2.js";
import { DanmakuScriptLoader } from "../danmaku/DanmakuScriptLoader.js";
import { logger } from "../utils/Logger.js";

/**
 * Boss.js - Boss类（优化版）
 */
export class Boss extends Entity {
    constructor(x, y) {
        super(x, y);
        
        // 基础属性
        this.radius = 25;
        this.name = 'Unknown';
        this.title = '';
        
        // 战斗属性
        this.maxHealth = 1000;
        this.health = this.maxHealth;
        
        // 阶段管理
        this.currentPhase = 0;
        this.phases = [];
        this.isInvincible = false;
        
        // 移动相关
        this.moveSpeed = 100;
        this.targetPosition = new Vector2(x, y);
        this.isMoving = false;
        this.moveTimer = 0;
        this.moveInterval = 3;
        
        // 状态
        this.isEntering = true;
        this.enterProgress = 0;
        
        // 符卡
        this.spellCardTime = 0;
        this.spellCardMaxTime = 60;
        this.totalMusicDuration = 0;
        
        // 移动模式专用变量
        this._moveTarget = null;
        this._moveTimer = 0;
        this._phaseTime = 0;
        
        // 配色
        this.colors = {
            hair: '#e8d5e0',
            hairband: '#8b4d6e',
            dress: '#2d1b2e',
            ribbon: '#e74c3c',
            eye: '#9b59b6',
            eyeGlow: '#e74c3c',
            heart: '#ff69b4'
        };
        
        // 动画
        this.hoverOffset = 0;
        this.eyePulse = 0;
        this.heartFloat = 0;

        // 对话系统
        this.dialogSystem = {
            queue: [],
            current: null,
            timer: 0,
            maxTime: 3,
            showDuration: 3,
            isFighting: false,
            serverUrl: '',
            bossPath: '',
            loadedEmojis: new Map(),
            onFightStart: null
        };

        // 表情加载状态
        this.emojis = {
            boss: new Map(),
            player: new Map()
        };
        
        // 节奏同步
        this.beatSyncEnabled = true;
        this.lastDrumType = null;
        this.beatCooldown = 0;
        
        // 死亡状态
        this.isDefeating = false;
        this.defeatProgress = 0;
        this.explosionParticles = [];
        
        // 攻击模式
        this.attackPatterns = { kick: null, snare: null, hihat: null, accent: null };

        // 音乐同步相关
        this.musicSyncEnabled = false;
        this.lastMusicIntensity = 1.0;
        this.beatCounter = 0;
        
        // 脚本加载器
        this.scriptLoader = new DanmakuScriptLoader();
        
        // 配置加载器
        this.configLoader = null;
        
        // 对话系统
        this.dialogQueue = [];
        this.currentDialog = null;
        this.dialogTimer = 0;
        
        // 动画帧
        this.animFrame = 0;
        this.animConfig = null;
    }
    
    /**
     * 从配置加载器加载Boss
     */
    async loadFromConfig(configLoader, bossPath) {
        this.configLoader = configLoader;
        this.dialogSystem.bossPath = bossPath;
        
        // 加载Boss配置
        const bossConfig = await configLoader.loadBoss(bossPath);
        if (!bossConfig) {
            logger.error('Failed to load boss config');
            return false;
        }
        
        // 设置基本信息
        this.name = bossConfig.name;
        this.title = bossConfig.title;
        this.version = bossConfig.version;
        this.serverBaseUrl = bossConfig.serverBaseUrl;
        this.dialogSystem.serverUrl = bossConfig.serverBaseUrl;
        
        // 处理对话配置
        if (bossConfig.conversion && bossConfig.conversion.length > 0) {
            this.setupConversations(bossConfig.conversion);
        }
        
        // 设置音乐同步
        this.musicSyncEnabled = bossConfig.meta.followMusic || false;
        
        if (bossConfig.meta.musicSync) {
            this.musicSyncConfig = bossConfig.meta.musicSync;
        }
        
        if (bossConfig.meta.colors) {
            this.colors = { ...this.colors, ...bossConfig.meta.colors };
        }
        
        // 加载弹幕脚本
        const danmakuScript = configLoader.getCurrentDanmakuScript();
        if (danmakuScript) {
            if (this.scriptLoader.audioEngine) {
                await this.createPhasesFromScript(danmakuScript);
            } else {
                logger.warn('Audio engine not set, phases will be created without rhythm sync');
                await this.createPhasesFromScript(danmakuScript, false);
            }
        }
        
        // 加载动画配置
        this.animConfig = configLoader.getCurrentAnimConfig();
        
        logger.info(`Boss "${this.name}" loaded successfully`);
        return true;
    }

    /**
     * 设置对话序列
     */
    setupConversations(conversations) {
        this.dialogSystem.queue = [];
        
        conversations.forEach(convSequence => {
            convSequence.forEach(dialogItem => {
                if (dialogItem.stat === 'fight') {
                    this.dialogSystem.queue.push({
                        type: 'fight',
                        stat: 'fight'
                    });
                } else {
                    this.dialogSystem.queue.push({
                        type: 'dialog',
                        boss: dialogItem.boss || '',
                        player: dialogItem.player || '',
                        bossEmoji: dialogItem.boss_emoji,
                        playerEmoji: dialogItem.player_emoji,
                        stat: dialogItem.stat || 'say',
                        duration: dialogItem.duration || 3
                    });
                    
                    // 预加载表情
                    this.preloadEmoji('boss', dialogItem.boss_emoji);
                    this.preloadEmoji('player', dialogItem.player_emoji);
                }
            });
        });
        
        logger.info(`Loaded ${this.dialogSystem.queue.length} dialog items`);
    }

    /**
     * 预加载表情图片
     */
    async preloadEmoji(type, emojiFile) {
        if (!emojiFile || this.emojis[type].has(emojiFile)) return;
        
        const emojiUrl = this.getEmojiUrl(type, emojiFile);
        
        try {
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = emojiUrl;
            });
            this.emojis[type].set(emojiFile, img);
            logger.debug(`Loaded emoji: ${emojiUrl}`);
        } catch (error) {
            logger.warn(`Failed to load emoji: ${emojiUrl}`, error);
            // 创建占位图片
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = type === 'boss' ? '#e74c3c' : '#3498db';
            ctx.beginPath();
            ctx.arc(16, 16, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(type === 'boss' ? 'B' : 'P', 16, 16);
            
            const img = new Image();
            img.src = canvas.toDataURL();
            this.emojis[type].set(emojiFile, img);
        }
    }
    
    /**
     * 获取表情URL
     */
    getEmojiUrl(type, emojiFile) {
        if (!emojiFile) return null;
        
        const bossName = this.dialogSystem.bossPath.split('/').filter(p => p).pop() || 'satori';
        
        return `${this.dialogSystem.serverUrl}Boss/${bossName}/${emojiFile}`;
    }
    
    /**
     * 从弹幕脚本创建阶段
     */
    async createPhasesFromScript(script, enableRhythm = true) {
        if (!script || !script.phases) {
            logger.error('Invalid danmaku script');
            return;
        }
        
        // 获取子弹池
        const bulletPool = window.game?.bulletPool;
        if (!bulletPool) {
            logger.error('Bullet pool not available');
            return;
        }
        
        // 使用脚本加载器创建阶段
        this.phases = this.scriptLoader.createPhasesFromScript(script, bulletPool);
        
        // 计算总血量
        this.maxHealth = this.phases.reduce((sum, phase) => sum + (phase.health || 0), 0);
        this.health = this.maxHealth;
        
        // 进入第一阶段
        if (this.phases.length > 0) {
            this.enterPhase(0);
        }
        
        logger.info(`Created ${this.phases.length} phases for ${this.name}`);
    }
    
    /**
     * 进入阶段
     */
    enterPhase(phaseIndex) {
        if (phaseIndex >= this.phases.length) {
            this.onDefeated();
            return;
        }
        
        this.currentPhase = phaseIndex;
        const phase = this.phases[phaseIndex];
        
        // 更新生命值
        this.maxHealth = phase.health || this.maxHealth;
        this.health = phase.health || this.maxHealth;
        
        // 符卡时间
        this.spellCardMaxTime = phase.time || 60;
        this.spellCardTime = 0;
        this._phaseTime = 0;
        
        // 设置攻击模式
        if (phase.attackPatterns) {
            this.attackPatterns = phase.attackPatterns;
        }
        
        // 触发进入回调
        if (phase.onEnter) phase.onEnter(this);
        
        // 如果有对话，加入对话队列
        if (phase.dialog) {
            this.dialogQueue.push(...phase.dialog);
        }
        
        logger.info(`Entered phase ${phaseIndex}: ${phase.name || 'Unknown'}`);
    }
    
    /**
     * 更新方法
     */
    update(deltaTime, player, bulletPool, audioEngine) {
        // 更新音乐同步状态
        if (audioEngine && this.musicSyncEnabled) {
            this.updateMusicSync(audioEngine);
        }
        
        super.update(deltaTime);
        
        // 处理死亡
        if (this.isDefeating) {
            this.defeatProgress += deltaTime;
            this.updateExplosion(deltaTime);
            
            if (this.defeatProgress >= 3) {
                this.isActive = false;
                this.isDefeating = false;
            }
            return;
        }
        
        // 处理入场动画
        if (this.isEntering) {
            this.enterProgress += deltaTime * 0.5;
            if (this.enterProgress >= 1) {
                this.isEntering = false;
                this.enterProgress = 1;
            }
            return;
        }
        
        // 如果还没进入战斗，处理对话
        if (!this.dialogSystem.isFighting) {
            this.updateDialog(deltaTime);
        } else {
            // 战斗状态下的更新
            this.updateCombat(deltaTime, player, bulletPool, audioEngine);
        }
    }
    
    /**
     * 更新动画
     */
    updateAnimation(deltaTime) {
        this.hoverOffset = Math.sin(this.age * 2) * 5 * (1 + this.lastMusicIntensity * 0.3);
        this.eyePulse = (Math.sin(this.age * 3) * 0.3 + 0.7) * (1 + this.lastMusicIntensity * 0.2);
        this.heartFloat = Math.sin(this.age * 4) * 3 * (1 + this.lastMusicIntensity * 0.5);
        
        if (this.animConfig) {
            this.animFrame += deltaTime * 10;
            if (this.animFrame >= Object.keys(this.animConfig).length) {
                this.animFrame = 0;
            }
        }
    }
    
    /**
     * 更新对话系统
     */
    updateDialog(deltaTime) {
        // 如果队列为空，自动进入战斗
        if (this.dialogSystem.queue.length === 0) {
            this.startFight();
            return;
        }
        
        // 如果没有当前对话，获取下一个
        if (!this.dialogSystem.current) {
            this.dialogSystem.current = this.dialogSystem.queue.shift();
            
            // 如果是战斗指令，进入战斗
            if (this.dialogSystem.current.type === 'fight') {
                this.startFight();
                return;
            }
            
            // 设置显示时长
            this.dialogSystem.timer = this.dialogSystem.current.duration || this.dialogSystem.maxTime;
            
            // 触发对话开始事件
            if (window.game) {
                window.game.onDialogStart(this.dialogSystem.current);
            }
        } else {
            // 更新计时器
            this.dialogSystem.timer -= deltaTime;
            
            // 计时结束，清除当前对话
            if (this.dialogSystem.timer <= 0) {
                this.dialogSystem.current = null;
                
                // 触发对话结束事件
                if (window.game) {
                    window.game.onDialogEnd();
                }
            }
        }
    }
    
    /**
     * 更新音乐同步
     */
    updateMusicSync(audioEngine) {
        this.lastMusicIntensity = audioEngine.getIntensity() || 1.0;
        
        const bpmInfo = audioEngine.getBPMStatus();
        this.beatCounter = bpmInfo.currentBeat || 0;
    }
    
    /**
     * 更新移动模式
     */
    updateMovementPattern(deltaTime) {
        if (!this.isMoving) return;

        const phase = this.phases[this.currentPhase];
        if (!phase || !phase.movePattern) return;
        
        phase.movePattern(this, deltaTime, this._phaseTime, this._moveTimer);
        this._moveTimer += deltaTime;
    }
    
    /**
     * 更新爆炸效果
     */
    updateExplosion(deltaTime) {
        this.explosionParticles = this.explosionParticles.filter(p => {
            p.life -= deltaTime;
            p.x += p.vx * deltaTime * 60;
            p.y += p.vy * deltaTime * 60;
            p.size *= 0.98;
            return p.life > 0;
        });
        
        if (this.defeatProgress < 2) {
            for (let i = 0; i < 5; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 2 + Math.random() * 8;
                this.explosionParticles.push({
                    x: this.position.x + (Math.random() - 0.5) * 50,
                    y: this.position.y + (Math.random() - 0.5) * 50,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size: 5 + Math.random() * 15,
                    life: 1 + Math.random(),
                    color: [this.colors.ribbon, this.colors.eye, this.colors.heart, '#fff'][Math.floor(Math.random() * 4)]
                });
            }
        }
    }
    
    /**
     * 鼓点命中回调
     */
    onDrumHit(drumType, strength, beat, player, bulletPool) {
        if (!this.isActive || this.isInvincible || this.isEntering || this.isDefeating) return;
        if (this.beatCooldown > 0) return;
        
        this.lastDrumType = drumType;
        
        const phase = this.phases[this.currentPhase];
        if (!phase) return;
        
        const pattern = phase.attackPatterns?.[drumType];
        
        if (pattern) {
            const bullets = pattern(this, player, bulletPool, strength, drumType);
            
            if (bullets?.length > 0) {
                bullets.forEach(b => {
                    if (b) {
                        const musicFactor = this.musicSyncEnabled ? this.lastMusicIntensity : 1.0;
                        b.glowSize = b.size * (2 + strength * 2 * musicFactor);
                        b.scale = 0.8 + strength * 0.4 * musicFactor;
                    }
                });
            }
        }
        
        this.beatCooldown = 0.05;
    }
    
    /**
     * 受到伤害
     */
    takeDamage(amount) {
        if (this.isInvincible || this.isEntering || this.isDefeating) return 0;
        
        const actualDamage = Math.min(amount, this.health);
        this.health -= actualDamage;
        
        if (this.health <= 0) this.onPhaseEnd();
        
        return actualDamage;
    }
    
    /**
     * 阶段结束
     */
    onPhaseEnd() {
        const phase = this.phases[this.currentPhase];
        if (phase?.onEnd) phase.onEnd(this);
        
        if (this.currentPhase + 1 >= this.phases.length) {
            this.onDefeated();
        } else {
            this.enterPhase(this.currentPhase + 1);
        }
    }
    
    /**
     * 击败
     */
    onDefeated() {
        this.isDefeating = true;
        this.defeatProgress = 0;
        this.explosionParticles = [];
        
        for (let i = 0; i < 50; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 5 + Math.random() * 15;
            this.explosionParticles.push({
                x: this.position.x,
                y: this.position.y,
                vx: 0,
                vy: 0,
                size: 10 + Math.random() * 20,
                life: 2 + Math.random(),
                color: [this.colors.ribbon, this.colors.eye, this.colors.heart, '#fff'][Math.floor(Math.random() * 4)]
            });
        }
        
        if (this.onDefeatCallback) this.onDefeatCallback();
        
        logger.info('Boss defeated!');
    }
    
    /**
     * 设置击败回调
     */
    setOnDefeatCallback(callback) {
        this.onDefeatCallback = callback;
    }

    /**
     * 开始战斗
     */
    startFight() {
        this.dialogSystem.isFighting = true;
        this.dialogSystem.current = null;
        
        logger.info('Fight started!');
        
        if (this.dialogSystem.onFightStart) {
            this.dialogSystem.onFightStart();
        }
        
        if (window.game) {
            window.game.onFightStart();
        }
    }

    setMoving(move) {
        this.isMoving = move;
    }

    /**
     * 更新战斗状态
     */
    updateCombat(deltaTime, player, bulletPool, audioEngine) {

        this.updateMovementPattern(deltaTime);
        
        const phase = this.phases[this.currentPhase];
        if (phase) {
            this.spellCardTime += deltaTime;
            this._phaseTime += deltaTime;
            
            if (phase.spellCard?.isTimed && this.spellCardTime >= this.spellCardMaxTime) {
                this.takeDamage(this.health);
            } else if (phase.autoAdvance && this.spellCardTime >= this.spellCardMaxTime) {
                this.onPhaseEnd();
            }
        }
        
        if (this.beatCooldown > 0) this.beatCooldown -= deltaTime;
    }
    
    /**
     * 设置战斗开始回调
     */
    setOnFightStart(callback) {
        this.dialogSystem.onFightStart = callback;
    }
    
    /**
     * 渲染方法
     */
    draw(ctx) {
        if (!this.isVisible) return;
        
        if (this.isDefeating) {
            this.drawExplosion(ctx);
            return;
        }
        
        ctx.save();
        
        if (this.isEntering) {
            const scale = this._easeOutBack(this.enterProgress);
            ctx.scale(scale, scale);
        }
        
        ctx.translate(0, this.hoverOffset);
        
        // 绘制魔法阵
        this.drawMagicCircle(ctx);
        
        // 绘制Boss本体
        this.drawBossSprite(ctx);
        
        // 绘制血条（战斗中才显示）
        if (this.dialogSystem.isFighting && this.health < this.maxHealth) {
            this.drawHealthBar(ctx);
        }
        
        // 绘制对话框（非战斗状态）
        if (!this.dialogSystem.isFighting && this.dialogSystem.current) {
            this.drawDialog(ctx);
        }
        
        ctx.restore();
    }
    
    /**
     * 绘制对话框
     */
    drawDialog(ctx) {
        const dialog = this.dialogSystem.current;
        if (!dialog) return;
        
        const width = 400;
        const height = 120;
        const x = -width / 2;
        const y = -this.radius * 3;
        
        ctx.save();
        
        // 对话框背景
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.strokeStyle = this.colors.ribbon;
        ctx.lineWidth = 3;
        ctx.shadowColor = this.colors.ribbon;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.roundRect(x, y - height, width, height, 15);
        ctx.fill();
        ctx.stroke();
        
        // 说话者标识
        ctx.shadowBlur = 5;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(this.name, x + 60, y - height + 30);
        
        // 绘制Boss表情
        if (dialog.bossEmoji) {
            const emojiImg = this.emojis.boss.get(dialog.bossEmoji);
            if (emojiImg) {
                ctx.drawImage(emojiImg, x + 10, y - height + 10, 40, 40);
            } else {
                ctx.fillStyle = this.colors.ribbon;
                ctx.beginPath();
                ctx.arc(x + 30, y - height + 30, 15, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 20px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('?', x + 30, y - height + 30);
            }
        }
        
        // 对话内容
        ctx.shadowBlur = 3;
        ctx.fillStyle = '#fff';
        ctx.font = '14px "Noto Sans SC", sans-serif';
        
        if (dialog.boss) {
            this.drawWrappedText(ctx, dialog.boss, x + 60, y - height + 60, width - 70, 20);
        } else if (dialog.player) {
            this.drawWrappedText(ctx, dialog.player, x + 60, y - height + 60, width - 70, 20);
        }
        
        // 绘制进度指示
        const totalItems = this.dialogSystem.queue.length + (this.dialogSystem.current ? 1 : 0);
        const currentIndex = totalItems - this.dialogSystem.queue.length;
        
        for (let i = 0; i < totalItems; i++) {
            const dotX = x + width - 20 - i * 15;
            const dotY = y - 5;
            
            ctx.fillStyle = i < currentIndex ? this.colors.ribbon : 'rgba(255, 255, 255, 0.3)';
            ctx.beginPath();
            ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    /**
     * 绘制换行文本
     */
    drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
        const words = text.split('');
        let line = '';
        let lineY = y;
        
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n];
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;
            
            if (testWidth > maxWidth && n > 0) {
                ctx.fillText(line, x, lineY);
                line = words[n];
                lineY += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, lineY);
    }
    
    /**
     * 绘制爆炸
     */
    drawExplosion(ctx) {
        ctx.save();
        
        this.explosionParticles.forEach(p => {
            ctx.globalAlpha = Math.min(p.life, 1);
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = p.size;
            
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
        
        const flashIntensity = Math.max(0, 1 - this.defeatProgress / 0.5);
        if (flashIntensity > 0) {
            ctx.globalAlpha = flashIntensity;
            const gradient = ctx.createRadialGradient(
                this.position.x, this.position.y, 0,
                this.position.x, this.position.y, 200
            );
            gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
            
            const ribbonRGB = this.hexToRgb(this.colors.ribbon);
            const eyeRGB = this.hexToRgb(this.colors.eye);
            
            gradient.addColorStop(0.3, `rgba(${ribbonRGB.r}, ${ribbonRGB.g}, ${ribbonRGB.b}, 0.8)`);
            gradient.addColorStop(0.6, `rgba(${eyeRGB.r}, ${eyeRGB.g}, ${eyeRGB.b}, 0.4)`);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(this.position.x, this.position.y, 200, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }

    /**
     * 辅助方法：将十六进制颜色转换为 RGB 对象
     */
    hexToRgb(hex) {
        hex = hex.replace('#', '');
        
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        return { r, g, b };
    }
    
    /**
     * 绘制Boss精灵
     */
    drawBossSprite(ctx) {
        const r = this.radius;
        const c = this.colors;
        
        ctx.save();
        ctx.shadowColor = c.eye;
        ctx.shadowBlur = 15;
        
        // 绘制身体
        if (c.body) {
            ctx.fillStyle = c.body;
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 0.8, r, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = c.dress;
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 0.8, r, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // 绘制眼睛
        ctx.fillStyle = c.eye;
        ctx.beginPath();
        ctx.ellipse(-r * 0.3, -r * 0.2, r * 0.15, r * 0.2, 0, 0, Math.PI * 2);
        ctx.ellipse(r * 0.3, -r * 0.2, r * 0.15, r * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // 瞳孔
        ctx.fillStyle = c.eyeGlow;
        ctx.beginPath();
        ctx.arc(-r * 0.3, -r * 0.2, r * 0.07 * this.eyePulse, 0, Math.PI * 2);
        ctx.arc(r * 0.3, -r * 0.2, r * 0.07 * this.eyePulse, 0, Math.PI * 2);
        ctx.fill();
        
        // 高光
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(-r * 0.27, -r * 0.23, r * 0.03, 0, Math.PI * 2);
        ctx.arc(r * 0.33, -r * 0.23, r * 0.03, 0, Math.PI * 2);
        ctx.fill();
        
        // 心形装饰
        ctx.fillStyle = c.heart;
        this.drawHeart(ctx, 0, r * 0.5 + this.heartFloat, r * 0.2);
        ctx.fill();
        
        ctx.restore();
    }
    
    /**
     * 绘制魔法阵
     */
    drawMagicCircle(ctx) {
        const rotation = this.age * 0.5;
        
        ctx.save();
        ctx.rotate(rotation);
        
        // 外圈
        ctx.strokeStyle = this.colors.ribbon + '66';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 2.2, 0, Math.PI * 2);
        ctx.stroke();
        
        // 内圈
        ctx.strokeStyle = this.colors.eye + '66';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.6, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    }
    
    /**
     * 绘制心形
     */
    drawHeart(ctx, x, y, size) {
        ctx.beginPath();
        ctx.moveTo(x, y + size * 0.3);
        ctx.bezierCurveTo(x - size * 0.5, y - size * 0.3, x - size, y + size * 0.3, x, y + size);
        ctx.bezierCurveTo(x + size, y + size * 0.3, x + size * 0.5, y - size * 0.3, x, y + size * 0.3);
        ctx.closePath();
    }
    
    /**
     * 绘制血条
     */
    drawHealthBar(ctx) {
        const barWidth = this.radius * 2.5;
        const barHeight = 6;
        const x = -barWidth / 2;
        const y = -this.radius * 2.8;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x, y, barWidth, barHeight);
        
        const healthPercent = this.health / this.maxHealth;
        ctx.fillStyle = healthPercent > 0.5 ? '#2ecc71' : healthPercent > 0.25 ? '#f39c12' : '#e74c3c';
        ctx.fillRect(x, y, barWidth * healthPercent, barHeight);
        
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, barWidth, barHeight);
    }
    
    /**
     * 缓动函数
     */
    _easeOutBack(t) {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    
    /**
     * 获取当前阶段
     */
    getCurrentPhase() {
        return this.phases[this.currentPhase];
    }
    
    /**
     * 是否已击败
     */
    isDefeated() {
        return this.currentPhase >= this.phases.length || this.isDefeating;
    }
}

// 扩展CanvasRenderingContext2D，添加roundRect方法
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r);
        this.lineTo(x + w, y + h - r);
        this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.lineTo(x + r, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r);
        this.lineTo(x, y + r);
        this.quadraticCurveTo(x, y, x + r, y);
        return this;
    };
}
