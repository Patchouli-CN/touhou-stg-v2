import { Boss } from "../entities/Boss.js";
import { Player } from "../entities/Player.js";
import { BossConfigLoader } from "./BossConfigLoader.js";
import { AudioEngine } from "./AudioEngine.js";
import { SpellCardPortrait } from "../ui/SpellCardPortrait.js";
import { BulletPool, ParticlePool } from "./Pool.js";
import { logger } from "../utils/Logger.js";
import { PerformanceMonitor } from '../ui/PerformanceMonitor.js';

/**
 * TouhouWorld - 游戏主控制器（优化版）
 */
export class TouhouWorld {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        this.canvas.width = 600;
        this.canvas.height = 800;
        
        this.state = 'menu';
        this.lastTime = 0;
        this.deltaTime = 0;
        this.frameCount = 0;
        
        this.player = null;
        this.boss = null;
        this.bulletPool = null;
        this.particlePool = null;
        
        this.audioEngine = new AudioEngine();
        
        this.score = 0;
        this.hiScore = parseInt(localStorage.getItem('touhouHiScore') || '0');
        
        this.hitboxMode = 'normal';

        this.backgroundOffset = 0;

        // 优化：缓存属性
        this.starCache = null;
        this.lastStarUpdate = 0;
        this.backgroundFrameSkip = 0;

        // 立绘管理器
        this.spellCardPortrait = null;
        
        // 背景配置
        this.bgConfig = {
            preset: 'default',
            brightness: 0.7,
            blur: 0,
            parallax: true,
            customImage: null,
            customImageLoaded: false
        };

        // 对话UI元素
        this.dialogUI = {
            container: null,
            bossName: null,
            bossEmoji: null,
            bossText: null,
            playerName: null,
            playerEmoji: null,
            playerText: null,
            progress: null
        };
        
        this.keys = {};
        this._setupInput();
        
        this.selectedMusicFile = null;
        this.useDefaultMusic = false;
        
        this.victoryState = { isVictory: false, victoryTime: 0, showDialog: false };
        
        // 音乐相关
        this.musicLoaded = false;
        this.musicUrl = null;
        this.musicPath = null;
        this.serverBaseUrl = '';
        this.bossConfigLoader = null;
        
        // UI元素缓存
        this.uiElements = {};
        
        // 性能优化：碰撞检测缓存
        this._collisionCache = {
            lastCheckFrame: 0,
            playerHitbox: 0
        };

        this.performanceMonitor = new PerformanceMonitor({
            warningThreshold: 50,    // 50ms 警告
            criticalThreshold: 100,  // 100ms 严重警告
            warningCooldown: 2000    // 2秒内只显示一次
        });

        this.fpsUpdateTimer = 0;
        this.fpsUpdateInterval = 0.2;  // 每秒更新5次
        this.frameCountSinceLastUpdate = 0;
        
        logger.info('TouhouWorld initialized');
    }
    
    init() {
        this.bulletPool = new BulletPool(500);
        this.particlePool = new ParticlePool(200);
        this.player = new Player(300, 650);
        
        // 先不要让玩家使用炸弹和射击
        this.player.setBombEnabled(false);
        this.player.setShootEnabled(false);

        // 创建立绘管理器
        this.spellCardPortrait = new SpellCardPortrait();
        
        this.createBoss();
        this.audioEngine.init();
        
        document.getElementById('hitboxSelect')?.addEventListener('change', (e) => {
            this.hitboxMode = e.target.value;
        });
        
        this.setupMusicSelectUI();

        this.canvas.addEventListener('webglcontextlost', (e) => {
            logger.fatal('Canvas context lost', e);
        });
        
        logger.info('Game initialized');
    }

    /**
     * 初始化UI元素
     */
    initUI() {
        if (!document.getElementById('dialogContainer')) {
            const dialogContainer = document.createElement('div');
            dialogContainer.id = 'dialogContainer';
            dialogContainer.className = 'dialogContainer';
            
            dialogContainer.innerHTML = `
                <div class="dialogContent">
                    <div class="bossDialogArea">
                        <div class="portraitContainer">
                            <div class="bossPortrait" id="bossPortrait">
                                <img id="bossEmoji" src="" alt="Boss" style="display: none;">
                                <div id="bossPlaceholder" style="font-size: 48px;">👾</div>
                            </div>
                        </div>
                        <div class="nameTag bossNameTag" id="bossNameTag">未知</div>
                        <div class="dialogBubble bossBubble">
                            <p class="dialogText" id="bossDialogText"></p>
                        </div>
                    </div>
                    
                    <div class="playerDialogArea">
                        <div class="portraitContainer">
                            <div class="playerPortrait" id="playerPortrait">
                                <img id="playerEmoji" src="" alt="Player" style="display: none;">
                                <div id="playerPlaceholder" style="font-size: 48px;">👧</div>
                            </div>
                        </div>
                        <div class="nameTag playerNameTag" id="playerNameTag">我</div>
                        <div class="dialogBubble playerBubble">
                            <p class="dialogText" id="playerDialogText"></p>
                        </div>
                    </div>
                </div>
                
                <div class="dialogProgress" id="dialogProgress"></div>
                <div class="skipHint">按空格键继续</div>
            `;
            
            document.getElementById('uiLayer').appendChild(dialogContainer);
        }
        
        // 缓存UI元素引用
        this.dialogUI.container = document.getElementById('dialogContainer');
        this.dialogUI.bossPortrait = document.getElementById('bossPortrait');
        this.dialogUI.bossEmoji = document.getElementById('bossEmoji');
        this.dialogUI.bossPlaceholder = document.getElementById('bossPlaceholder');
        this.dialogUI.bossNameTag = document.getElementById('bossNameTag');
        this.dialogUI.bossText = document.getElementById('bossDialogText');
        
        this.dialogUI.playerPortrait = document.getElementById('playerPortrait');
        this.dialogUI.playerEmoji = document.getElementById('playerEmoji');
        this.dialogUI.playerPlaceholder = document.getElementById('playerPlaceholder');
        this.dialogUI.playerNameTag = document.getElementById('playerNameTag');
        this.dialogUI.playerText = document.getElementById('playerDialogText');
        
        this.dialogUI.progress = document.getElementById('dialogProgress');
    }

    /**
     * 对话开始回调
     */
    onDialogStart(dialog) {
        if (!this.dialogUI.container) this.initUI();
        
        this.dialogUI.container.style.display = 'block';
        
        if (this.boss?.name) {
            this.dialogUI.bossNameTag.textContent = this.boss.name;
        }
        
        this.dialogUI.playerNameTag.textContent = '我';
        
        if (dialog.boss) {
            this.dialogUI.bossText.textContent = dialog.boss;
            
            if (dialog.bossEmoji && this.boss) {
                const emojiUrl = this.boss.getEmojiUrl('boss', dialog.bossEmoji);
                this.dialogUI.bossEmoji.src = emojiUrl;
                this.dialogUI.bossEmoji.style.display = 'inline';
                this.dialogUI.bossPlaceholder.style.display = 'none';
            } else {
                this.dialogUI.bossEmoji.style.display = 'none';
                this.dialogUI.bossPlaceholder.style.display = 'flex';
            }
        }
        
        if (dialog.player) {
            this.dialogUI.playerText.textContent = dialog.player;
            
            if (dialog.playerEmoji && this.boss) {
                const emojiUrl = this.boss.getEmojiUrl('player', dialog.playerEmoji);
                this.dialogUI.playerEmoji.src = emojiUrl;
                this.dialogUI.playerEmoji.style.display = 'inline';
                this.dialogUI.playerPlaceholder.style.display = 'none';
            } else {
                this.dialogUI.playerEmoji.style.display = 'none';
                this.dialogUI.playerPlaceholder.style.display = 'flex';
            }
        }
        
        this.updateDialogProgress();
    }

    /**
     * 对话结束回调
     */
    onDialogEnd() {
        if (this.dialogUI.container) {
            this.dialogUI.container.style.display = 'none';
        }
    }

    /**
     * 战斗开始回调
     */
    onFightStart() {
        if (this.dialogUI.container) {
            this.dialogUI.container.style.display = 'none';
        }
        
        const bossUI = document.getElementById('bossUI');
        if (bossUI) bossUI.classList.remove('hidden');
        
        this.showToast('⚔️ 战斗开始！ ⚔️');

        this.player.setBombEnabled(true);
        this.player.setShootEnabled(true);
        this.boss.setMoving(true);
        
        this.startFightMusic();
    }
    
    /**
     * 开始播放战斗音乐
     */
    async startFightMusic() {
        logger.info('Starting fight music...');
        logger.debug(`useDefaultMusic: ${this.useDefaultMusic}`);
        logger.debug(`musicUrl: ${this.musicUrl}`);
        
        if (!this.audioEngine.isInitialized) {
            logger.debug('AudioEngine not initialized, initializing...');
            await this.audioEngine.init();
        }
        
        if (this.musicUrl && !this.useDefaultMusic) {
            logger.debug(`Attempting to fetch music from: ${this.musicUrl}`);
            
            try {
                const response = await fetch(this.musicUrl);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const blob = await response.blob();
                
                if (blob.size === 0) {
                    throw new Error('Music file is empty');
                }
                
                const fileName = this.musicPath.split('/').pop() || 'music.mp3';
                const file = new File([blob], fileName, { type: blob.type });
                
                const result = await this.audioEngine.loadAudioFile(file);
                
                if (result.success) {
                    logger.info('Music loaded successfully, starting playback');
                    await this.audioEngine.play();
                    
                    const musicInfo = document.getElementById('musicInfo');
                    const musicName = document.getElementById('musicName');
                    
                    if (musicInfo) musicInfo.classList.remove('hidden');
                    if (musicName) musicName.textContent = fileName;
                } else {
                    logger.error('Failed to load music:', result.error);
                    this.fallbackToDefaultMusic();
                }
            } catch (error) {
                logger.error('Error starting fight music:', error);
                this.fallbackToDefaultMusic();
            }
        } else {
            logger.info('No music URL or useDefaultMusic=true, falling back to default metronome mode');
            this.fallbackToDefaultMusic();
        }
    }

    /**
     * 回退到默认节拍模式
     */
    fallbackToDefaultMusic() {
        logger.info('Falling back to default metronome mode');
        this.useDefaultMusic = true;
        this.audioEngine.setBPM(128);
        this.audioEngine.startMetronomeMode();
        
        const musicInfo = document.getElementById('musicInfo');
        if (musicInfo) musicInfo.classList.add('hidden');
    }

    /**
     * 预加载音乐文件
     */
    async preloadMusic() {
        if (!this.musicPath) {
            logger.warn('No music path specified');
            return;
        }
        
        const bossName = this.bossConfigLoader.currentBoss?.path.split('/').filter(p => p).pop() || 'satori';
        
        const baseUrl = this.serverBaseUrl.endsWith('/') ? this.serverBaseUrl : this.serverBaseUrl + '/';
        const musicUrl = `${baseUrl}Boss/${bossName}/${this.musicPath}`;
        
        logger.info(`Preloading music: ${musicUrl}`);
        
        this.musicUrl = musicUrl;
        
        try {
            const response = await fetch(musicUrl, { method: 'HEAD' });
            
            if (response.ok) {
                logger.info(`Music file found: ${musicUrl}`);
                this.musicLoaded = true;
            } else {
                logger.warn(`Music file not found: ${musicUrl} (${response.status})`);
                this.useDefaultMusic = true;
            }
        } catch (error) {
            logger.error('Failed to preload music:', error);
            this.useDefaultMusic = true;
        }
    }

    /**
     * 更新对话进度
     */
    updateDialogProgress() {
        if (!this.boss || !this.dialogUI.progress) return;
        
        const queue = this.boss.dialogSystem.queue;
        const current = this.boss.dialogSystem.current;
        
        const totalItems = queue.length + (current ? 1 : 0);
        const currentIndex = totalItems - queue.length;
        
        let html = '';
        for (let i = 0; i < totalItems; i++) {
            const isActive = i === currentIndex;
            const isPast = i < currentIndex;
            const className = `progressDot ${isPast ? 'past' : (isActive ? 'active' : 'future')}`;
            html += `<div class="${className}"></div>`;
        }
        
        this.dialogUI.progress.innerHTML = html;
    }
    
    /**
     * 更新背景配置
     */
    updateBackground(config) {
        if (config) {
            this.bgConfig = { ...this.bgConfig, ...config };
        }
    }
    
    /**
     * 加载自定义背景图片
     */
    loadCustomBackground(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.bgConfig.customImage = img;
                this.bgConfig.customImageLoaded = true;
                this.bgConfig.preset = 'custom';
                resolve(img);
            };
            img.onerror = (e) => {
                logger.error('Failed to load custom background:', e);
                reject(e);
            };
            img.src = URL.createObjectURL(file);
        });
    }
    
    /**
     * 创建Boss
     */
    async createBoss(bossPath = 'Boss/satori/') {
        this.boss = new Boss(300, 150);
        
        // 连接音频引擎
        if (this.boss.scriptLoader) {
            this.boss.scriptLoader.setAudioEngine(this.audioEngine);
        }
        
        // 创建配置加载器
        if (!this.bossConfigLoader) {
            this.bossConfigLoader = new BossConfigLoader();
        }
        
        try {
            // 从配置文件加载Boss
            const success = await this.boss.loadFromConfig(this.bossConfigLoader, bossPath);
            
            if (success) {
                logger.info(`Boss ${this.boss.name} loaded successfully`);

                // 保存服务器URL和音乐路径
                this.serverBaseUrl = this.boss.serverBaseUrl || '';
                this.musicPath = this.bossConfigLoader.currentBoss?.meta?.music_path || 'default.wav';
                
                logger.debug(`Music path: ${this.musicPath}`);
                logger.debug(`Server URL: ${this.serverBaseUrl}`);
                
                // 设置战斗开始回调
                this.boss.setOnFightStart(() => this.onFightStart());
                
                // 初始化对话UI
                this.initUI();
                
                // 预加载音乐但不播放
                this.preloadMusic();
                
                if (this.boss.dialogSystem.queue.length > 0) {
                    logger.info('Press SPACE to continue dialog');
                }
            } else {
                logger.error('Failed to load boss from config, using default');
                this.createDefaultBoss();
            }
        } catch (error) {
            logger.error('Error loading boss:', error);
            this.createDefaultBoss();
        }
        
        this.boss.setOnDefeatCallback(() => this.onBossDefeated());
    }

    /**
     * 创建默认Boss
     */
    createDefaultBoss() {
        this.boss.name = '测试Boss';
        this.boss.title = '测试用Boss';
        this.boss.maxHealth = 500;
        this.boss.health = 500;
        
        this.boss.dialogSystem = {
            queue: [
                { type: 'dialog', boss: '这是测试对话1', duration: 2 },
                { type: 'dialog', boss: '这是测试对话2', duration: 2 },
                { type: 'fight' }
            ],
            current: null,
            timer: 0,
            isFighting: false
        };
        
        this.boss.setOnFightStart(() => this.onFightStart());
    }
    
    /**
     * 开始游戏
     */
    async start() {
        this.player.setBombEnabled(false);
        this.player.setShootEnabled(false);
        
        // 完全重置音频引擎
        this.audioEngine.reset();
        
        this.state = 'playing';
        this.score = 0;
        this.frameCount = 0;
        this.victoryState = { isVictory: false, victoryTime: 0, showDialog: false };
        
        this.player.reset(300, 650);
        
        // 使用选择的Boss路径
        const bossPath = this.selectedBossPath || 'Boss/satori/';
        await this.createBoss(bossPath);
        
        this.bulletPool.clear();
        this.particlePool.clear();
        
        // 设置鼓点回调
        this.audioEngine.onDrumHit((drumType, strength, beat) => {
            this.onDrumHit(drumType, strength, beat);
        });
        
        // 强制更新一次UI
        this.forceUpdateUI();
        
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.gameLoop(t));
        
        document.getElementById('startMenu')?.classList.add('hidden');
        document.getElementById('gameOverScreen')?.classList.add('hidden');
        
        // 显示提示
        this.showToast('按空格键继续对话...');
        
        logger.info('Game started');
    }
    
    // 修改 gameLoop
    gameLoop(currentTime) {
        if (this.state !== 'playing') return;
        
        const frameTime = currentTime - this.lastTime;
        this.fpsUpdateTimer += frameTime;
        this.frameCountSinceLastUpdate++;
        
        // 每 0.2 秒更新一次 FPS 显示
        if (this.fpsUpdateTimer >= this.fpsUpdateInterval * 1000) {
            const avgFps = Math.round(this.frameCountSinceLastUpdate / this.fpsUpdateTimer * 1000);
            
            const fpsElement = document.getElementById('fpsValue');
            if (fpsElement) {
                fpsElement.textContent = avgFps;
                
                // 颜色指示
                if (avgFps >= 55) fpsElement.style.color = '#2ecc71';
                else if (avgFps >= 30) fpsElement.style.color = '#f39c12';
                else fpsElement.style.color = '#e74c3c';
            }
            
            // 重置计数器
            this.fpsUpdateTimer = 0;
            this.frameCountSinceLastUpdate = 0;
        }
        
        this.deltaTime = Math.min(frameTime / 1000, 0.1);
        this.lastTime = currentTime;
        this.frameCount++;
        
        this.update(this.deltaTime);
        this.render();
        
        requestAnimationFrame((t) => this.gameLoop(t));
    }
    
    update(deltaTime) {
        if (this.victoryState.isVictory) {
            this.victoryState.victoryTime += deltaTime;
            
            if (this.victoryState.victoryTime >= 0.5 && this.audioEngine.isPlaying) {
                this.audioEngine.stop();
            }
            
            if (this.victoryState.victoryTime >= 2 && !this.victoryState.showDialog) {
                this.victoryState.showDialog = true;
                this.showVictoryDialog();
            }
            
            if (this.boss?.isDefeating) {
                this.boss.update(deltaTime, this.player, this.bulletPool, this.audioEngine);
            }
            
            this.particlePool.updateAll(deltaTime);
            return;
        }
        
        this.updateScreenEffects(deltaTime);
        this.updatePlayer(deltaTime);
        
        if (this.boss?.isActive) {
            this.boss.update(deltaTime, this.player, this.bulletPool, this.audioEngine);
        }
        
        this.bulletPool.updateAll(deltaTime);
        this.particlePool.updateAll(deltaTime);
        
        // 优化：每2帧检查一次碰撞
        if (this.frameCount % 2 === 0) {
            this.checkCollisions();
        }
        
        this.updateGameUI();
        
        if (this.player.isDead()) this.gameOver();
    }
    
    onBossDefeated() {
        this.victoryState.isVictory = true;
        this.victoryState.victoryTime = 0;
        
        // 停止音乐
        this.audioEngine.stop();
        
        if (this.score > this.hiScore) {
            this.hiScore = this.score;
            localStorage.setItem('touhouHiScore', this.hiScore.toString());
        }
        
        logger.info('Boss defeated!');
    }
    
    showVictoryDialog() {
        const noDeath = this.player.lives === 3;
        const noBomb = this.player.bombs === 3;
        const isPerfect = noDeath && noBomb;
        
        const dialog = document.createElement('div');
        dialog.id = 'victoryDialog';
        dialog.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex; justify-content: center; align-items: center;
            z-index: 1000; animation: fadeIn 0.5s ease;
        `;
        
        dialog.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #9b59b6, #e74c3c);
                padding: 50px 70px; border-radius: 20px;
                border: 3px solid rgba(255,255,255,0.2);
                box-shadow: 0 0 60px rgba(155, 89, 182, 0.6);
                text-align: center; animation: scaleIn 0.5s ease;
            ">
                <h1 style="font-size: 42px; color: #fff; margin-bottom: 20px; font-weight: 900;">
                    ${isPerfect ? '✨ 完美无瑕！ ✨' : '🎉 恭喜通关！ 🎉'}
                </h1>
                <p style="font-size: 20px; color: rgba(255,255,255,0.9); margin-bottom: 10px;">
                    ${this.boss?.name || 'Boss'}已被击败！
                </p>
                <p style="font-size: 16px; color: rgba(255,255,255,0.7); margin-bottom: 30px;">
                    ${isPerfect ? '无伤无弹，真正的强者！' : '你的实力令人惊叹！'}
                </p>
                <div style="
                    background: rgba(0,0,0,0.3); padding: 20px; border-radius: 10px; margin-bottom: 30px;
                ">
                    <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 5px;">最终得分</p>
                    <p style="font-size: 36px; color: #fff; font-weight: 900; font-family: monospace;">
                        ${this.score.toLocaleString()}
                    </p>
                </div>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="window.game.start(); document.getElementById('victoryDialog').remove()" 
                        style="padding: 15px 30px; font-size: 16px; background: #fff; color: #9b59b6; 
                        border: none; border-radius: 8px; cursor: pointer; font-weight: 700;">
                        再来一局
                    </button>
                    <button onclick="window.game.returnToMenu(); document.getElementById('victoryDialog').remove()" 
                        style="padding: 15px 30px; font-size: 16px; background: rgba(255,255,255,0.2); 
                        color: #fff; border: 2px solid #fff; border-radius: 8px; cursor: pointer; font-weight: 700;">
                        返回主菜单
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
    }
    
    updatePlayer(deltaTime) {
        this.player.setInput('up', this.keys['up']);
        this.player.setInput('down', this.keys['down']);
        this.player.setInput('left', this.keys['left']);
        this.player.setInput('right', this.keys['right']);
        this.player.setInput('shoot', this.keys['shoot']);
        this.player.setInput('bomb', this.keys['bomb']);
        this.player.setInput('focus', this.keys['focus']);
        
        this.player.update(deltaTime, this.bulletPool, this.particlePool);
    }
    
    updateScreenEffects(deltaTime) {
        // 更新背景偏移量
        this.backgroundOffset += deltaTime * 30 * (this.bgConfig.parallax ? 1 : 0.3);
        if (this.backgroundOffset > 100) this.backgroundOffset = 0;
    }
    
    /**
     * 检查碰撞 - 优化版
     */
    checkCollisions() {
        if (!this.player?.isActive) return;
        
        const playerHitbox = this.getPlayerHitbox();
        const bullets = this.bulletPool.activeObjects;
        
        for (const bullet of bullets) {
            if (!bullet.isActive) continue;
            
            // 玩家子弹击中Boss
            if (bullet.owner === 'player') {
                if (this.boss?.isActive && bullet.collidesWith(this.boss)) {
                    this.boss.takeDamage(bullet.damage);
                    bullet.destroy();
                    this.particlePool.spark(bullet.position.x, bullet.position.y, bullet.color, 3);
                }
                continue;
            }
            
            // 激光特殊处理：检查是否处于危险状态
            if (bullet.type === 'laser') {
                // 预警阶段不造成伤害
                if (bullet.isWarning || !bullet.isDangerous) {
                    // 仍然可以擦弹
                    this.checkGraze(bullet, playerHitbox);
                    continue;
                }
                
                // 激光伤害判定 - 使用线段碰撞检测
                if (this.checkLaserCollision(bullet, playerHitbox)) {
                    const tookDamage = this.player.takeDamage(this.bulletPool, this.particlePool);
                    if (tookDamage) {
                        this.forceUpdateUI();
                        if (this.player.isDead()) {
                            this.gameOver();
                            return;
                        }
                    }
                }
                continue;
            }
            
            // 普通弹幕碰撞检测（原有代码）
            const dx = bullet.position.x - this.player.position.x;
            const dy = bullet.position.y - this.player.position.y;
            const distanceSquared = dx * dx + dy * dy;
            
            // 擦弹检测
            const grazeRadius = this.player.grazeRadius + bullet.size;
            if (!bullet.hasGrazed && distanceSquared < grazeRadius * grazeRadius) {
                bullet.hasGrazed = true;
                this.score += this.player.graze();
                this.particlePool.spark(
                    this.player.position.x + dx * 0.5,
                    this.player.position.y + dy * 0.5,
                    '#00ffff', 2
                );
            }
            
            // 伤害检测
            const hitRadius = playerHitbox + bullet.size;
            if (distanceSquared < hitRadius * hitRadius) {
                const tookDamage = this.player.takeDamage(this.bulletPool, this.particlePool);
                if (tookDamage) {
                    this.forceUpdateUI();
                    if (this.player.isDead()) {
                        this.gameOver();
                        return;
                    }
                }
            }
        }
    }

    /**
     * 检查激光碰撞 - 线段与点的碰撞
     */
    checkLaserCollision(bullet, playerHitbox) {
        const angle = bullet.laserAngle !== undefined ? bullet.laserAngle : bullet.velocity.angle();
        const startX = bullet.position.x;
        const startY = bullet.position.y;
        const endX = startX + Math.cos(angle) * bullet.laserLength;
        const endY = startY + Math.sin(angle) * bullet.laserLength;
        
        // 计算玩家到激光线段的距离
        const px = this.player.position.x;
        const py = this.player.position.y;
        
        // 线段长度平方
        const lineLenSq = (endX - startX) ** 2 + (endY - startY) ** 2;
        
        if (lineLenSq === 0) return false; // 线段长度为0
        
        // 投影参数 t
        let t = ((px - startX) * (endX - startX) + (py - startY) * (endY - startY)) / lineLenSq;
        t = Math.max(0, Math.min(1, t)); // 限制在线段范围内
        
        // 最近点
        const closestX = startX + t * (endX - startX);
        const closestY = startY + t * (endY - startY);
        
        // 距离
        const distSq = (px - closestX) ** 2 + (py - closestY) ** 2;
        const hitDist = playerHitbox + bullet.laserWidth / 2;
        
        return distSq < hitDist * hitDist;
    }

    /**
     * 擦弹检测（提取为单独方法）
     */
    checkGraze(bullet, playerHitbox) {
        const dx = bullet.position.x - this.player.position.x;
        const dy = bullet.position.y - this.player.position.y;
        const distanceSquared = dx * dx + dy * dy;
        
        const grazeRadius = this.player.grazeRadius + bullet.size;
        if (!bullet.hasGrazed && distanceSquared < grazeRadius * grazeRadius) {
            bullet.hasGrazed = true;
            this.score += this.player.graze();
            this.particlePool.spark(
                this.player.position.x + dx * 0.5,
                this.player.position.y + dy * 0.5,
                '#00ffff', 2
            );
        }
    }
    
    getPlayerHitbox() {
        switch (this.hitboxMode) {
            case 'loose': return 1;
            case 'strict': return this.player.spriteRadius;
            default: return this.player.radius * 2;
        }
    }
    
    render() {
        const ctx = this.ctx;
        
        // 清空画布
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        ctx.save();
        
        // 绘制背景
        this.drawBackground(ctx);
        
        // 应用模糊效果
        if (this.bgConfig.blur > 0 && this.bgConfig.preset === 'custom' && this.bgConfig.customImageLoaded) {
            ctx.filter = `blur(${this.bgConfig.blur}px)`;
        }
        
        if (this.boss?.isActive || this.boss?.isDefeating) {
            this.boss.render(ctx);
        }
        
        this.bulletPool.renderAll(ctx);
        this.particlePool.renderAll(ctx);
        
        if (this.player?.isActive && !this.victoryState.isVictory) {
            this.player.render(ctx);
        }
        
        // 重置滤镜
        ctx.filter = 'none';
        
        ctx.restore();
    }
    
    /**
     * 绘制背景 - 优化版
     */
    drawBackground(ctx) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const config = this.bgConfig;
        
        // 如果有自定义图片且已加载，优先使用
        if (config.preset === 'custom' && config.customImageLoaded && config.customImage) {
            ctx.drawImage(config.customImage, 0, 0, w, h);
            
            ctx.fillStyle = `rgba(0, 0, 0, ${1 - config.brightness})`;
            ctx.fillRect(0, 0, w, h);
            return;
        }
        
        // 根据预设选择不同的渐变背景
        let gradient;
        
        switch (config.preset) {
            case 'palace':
                gradient = ctx.createLinearGradient(0, 0, 0, h);
                gradient.addColorStop(0, '#4a1a4a');
                gradient.addColorStop(0.5, '#2d1b2e');
                gradient.addColorStop(1, '#1a0a1a');
                break;
                
            case 'underground':
                gradient = ctx.createLinearGradient(0, 0, 0, h);
                gradient.addColorStop(0, '#1a1a2e');
                gradient.addColorStop(0.5, '#2d1b2e');
                gradient.addColorStop(1, '#0a0a1a');
                break;
                
            case 'default':
            default:
                gradient = ctx.createLinearGradient(0, 0, 0, h);
                gradient.addColorStop(0, '#1a0f1e');
                gradient.addColorStop(0.5, '#2d1b2e');
                gradient.addColorStop(1, '#0f0a12');
                break;
        }
        
        // 应用亮度
        ctx.fillStyle = gradient;
        ctx.globalAlpha = config.brightness;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        
        // 绘制星星
        this.drawStars(ctx, w, h, config);
        
        // 地底光柱（隔帧绘制）
        if (this.frameCount % 2 === 0) {
            ctx.strokeStyle = 'rgba(155, 89, 182, 0.1)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 2; i++) {
                const y = (i * 250 + this.backgroundOffset * 0.3) % h;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }
        }
    }

    /**
     * 绘制星星 - 优化版
     */
    drawStars(ctx, w, h, config) {
        const starCount = 20;
        
        // 预计算星星位置（每100帧更新一次）
        if (!this.starCache || this.frameCount % 100 === 0) {
            this.starCache = [];
            for (let i = 0; i < starCount; i++) {
                this.starCache.push({
                    baseX: (i * 47) % w,
                    baseY: (i * 73) % h,
                    size: (i % 3) + 1,
                    speed: 0.5 + i * 0.01,
                    alpha: 0.2 + (i % 5) * 0.15
                });
            }
        }
        
        ctx.fillStyle = '#fff';
        
        for (let i = 0; i < this.starCache.length; i++) {
            const star = this.starCache[i];
            
            const parallaxSpeed = config.parallax ? star.speed : 0.3;
            const y = (star.baseY + this.backgroundOffset * parallaxSpeed) % h;
            
            const alpha = star.alpha * config.brightness;
            if (alpha <= 0.05) continue;
            
            ctx.globalAlpha = alpha;
            ctx.fillRect(star.baseX, y, star.size, star.size);
        }
        
        ctx.globalAlpha = 1;
    }
    
    onDrumHit(drumType, strength, beat) {
        if (this.victoryState.isVictory) return;
        
        if (this.boss?.isActive && this.boss.dialogSystem.isFighting) {
            this.boss.onDrumHit(drumType, strength, beat, this.player, this.bulletPool);
        }
        
        this.updateDrumIndicator(drumType);
    }
    
    updateDrumIndicator(drumType) {
        const kickBar = document.getElementById('kickBar');
        const snareBar = document.getElementById('snareBar');
        const hihatBar = document.getElementById('hihatBar');
        
        [kickBar, snareBar, hihatBar].forEach(bar => {
            if (bar) bar.classList.remove('active');
        });
        
        let targetBar = null;
        switch (drumType) {
            case 'kick': targetBar = kickBar; break;
            case 'snare': targetBar = snareBar; break;
            case 'hihat': targetBar = hihatBar; break;
        }
        
        if (targetBar) {
            targetBar.classList.add('active');
            setTimeout(() => targetBar.classList.remove('active'), 150);
        }
    }
    
    /**
     * 显示符卡宣言
     */
    showSpellCardBanner(spellCardName, portraitImage = null) {
        if (!spellCardName) return;
        
        if (portraitImage && this.boss) {
            this.showSpellCardPortrait(spellCardName, portraitImage);
        }
    }
    
    showSpellCardPortrait(spellCardName, portraitImage) {
        if (!this.spellCardPortrait) return;
        
        const baseUrl = this.serverBaseUrl || 'http://127.0.0.1:9123/';
        const bossName = this.boss?.dialogSystem?.bossPath?.split('/').filter(p => p).pop() || 'satori';
        const portraitUrl = `${baseUrl}Boss/${bossName}/${portraitImage}`;
        logger.debug("portrait url:", portraitUrl);
        
        this.spellCardPortrait.show(this.boss?.name || 'Boss', spellCardName, portraitUrl, 1);
    }
    
    /**
     * 显示提示
     */
    showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
            background: linear-gradient(135deg, #9b59b6, #e74c3c);
            color: #fff; padding: 12px 24px; border-radius: 8px;
            font-size: 16px; font-weight: 700; z-index: 10000;
            box-shadow: 0 0 20px rgba(231, 76, 60, 0.5);
            animation: fadeInOut 2s ease forwards;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }
    
    /**
     * 更新游戏UI
     */
    updateGameUI() {
        // 生命显示
        const lifeCount = document.getElementById('lifeCount');
        if (lifeCount) {
            lifeCount.textContent = '★'.repeat(Math.max(0, this.player.lives));
        }
        
        // 炸弹显示
        const bombCount = document.getElementById('bombCount');
        if (bombCount) {
            bombCount.textContent = '○'.repeat(Math.max(0, this.player.bombs));
        }
        
        // 火力显示
        const powerValue = document.getElementById('powerValue');
        if (powerValue) {
            powerValue.textContent = this.player.power.toFixed(2);
        }
        
        // 擦弹显示
        const grazeValue = document.getElementById('grazeValue');
        if (grazeValue) {
            grazeValue.textContent = this.player.grazeCount;
        }
        
        // Boss血条
        if (this.boss?.dialogSystem?.isFighting) {
            const bossHealthFill = document.getElementById('bossHealthFill');
            const bossName = document.getElementById('bossName');
            const bossTitle = document.getElementById('bossTitle');
            
            if (bossHealthFill && this.boss.maxHealth > 0) {
                const healthPercent = (this.boss.health / this.boss.maxHealth) * 100;
                bossHealthFill.style.width = `${healthPercent}%`;
            }
            
            if (bossName) bossName.textContent = this.boss.name;
            if (bossTitle) bossTitle.textContent = this.boss.title;
        }
    }
    
    /**
     * 强制更新UI
     */
    forceUpdateUI() {
        this.updateGameUI();
    }
    
    /**
     * 游戏结束
     */
    gameOver() {
        this.state = 'gameover';
        this.audioEngine.stop();
        
        if (this.score > this.hiScore) {
            this.hiScore = this.score;
            localStorage.setItem('touhouHiScore', this.hiScore.toString());
        }
        
        const gameOverScreen = document.getElementById('gameOverScreen');
        const finalScoreValue = document.getElementById('finalScoreValue');
        
        if (gameOverScreen) gameOverScreen.classList.remove('hidden');
        if (finalScoreValue) finalScoreValue.textContent = this.score.toLocaleString();
        
        logger.info('Game over');
    }
    
    /**
     * 返回主菜单
     */
    returnToMenu() {
        this.state = 'menu';
        this.audioEngine.stop();
        
        document.getElementById('startMenu')?.classList.remove('hidden');
        document.getElementById('gameOverScreen')?.classList.add('hidden');
        document.getElementById('bossUI')?.classList.add('hidden');
        
        logger.info('Returned to menu');
    }
    
    /**
     * 设置输入
     */
    _setupInput() {
        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            
            // 方向键
            if (e.key === 'ArrowUp') this.keys['up'] = true;
            if (e.key === 'ArrowDown') this.keys['down'] = true;
            if (e.key === 'ArrowLeft') this.keys['left'] = true;
            if (e.key === 'ArrowRight') this.keys['right'] = true;
            
            // 功能键
            if (key === 'z') this.keys['shoot'] = true;
            if (key === 'x') this.keys['bomb'] = true;
            if (key === 'shift') this.keys['focus'] = true;
            
            // 空格键继续对话
            if (key === ' ' && this.boss && !this.boss.dialogSystem.isFighting) {
                // 跳过当前对话
                if (this.boss.dialogSystem.current) {
                    this.boss.dialogSystem.timer = 0;
                }
            }
            
            // ESC暂停
            if (key === 'escape') {
                this.togglePause();
            }
            
            // G键切换无敌模式
            if (key === 'g') {
                if (this.player) {
                    const godMode = this.player.toggleGodMode();
                    logger.info(`God mode ${godMode ? 'enabled' : 'disabled'}`);
                }
            }
        });
        
        document.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            
            if (e.key === 'ArrowUp') this.keys['up'] = false;
            if (e.key === 'ArrowDown') this.keys['down'] = false;
            if (e.key === 'ArrowLeft') this.keys['left'] = false;
            if (e.key === 'ArrowRight') this.keys['right'] = false;
            
            if (key === 'z') this.keys['shoot'] = false;
            if (key === 'x') this.keys['bomb'] = false;
            if (key === 'shift') this.keys['focus'] = false;
        });
    }
    
    /**
     * 暂停/继续
     */
    togglePause() {
        if (this.state === 'playing') {
            this.state = 'paused';
            this.audioEngine.pause();
            document.getElementById('pauseMenu')?.classList.remove('hidden');
            logger.info('Game paused');
        } else if (this.state === 'paused') {
            this.state = 'playing';
            this.audioEngine.resume();
            document.getElementById('pauseMenu')?.classList.add('hidden');
            this.lastTime = performance.now();
            requestAnimationFrame((t) => this.gameLoop(t));
            logger.info('Game resumed');
        }
    }
    
    /**
     * 设置音乐选择UI
     */
    setupMusicSelectUI() {
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.addEventListener('click', () => this.start());
        }
        
        const restartBtn = document.getElementById('restartBtn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => this.start());
        }
        
        const menuBtn = document.getElementById('menuBtn');
        if (menuBtn) {
            menuBtn.addEventListener('click', () => this.returnToMenu());
        }
        
        const resumeBtn = document.getElementById('resumeBtn');
        if (resumeBtn) {
            resumeBtn.addEventListener('click', () => this.togglePause());
        }
        
        const pauseMenuBtn = document.getElementById('pauseMenuBtn');
        if (pauseMenuBtn) {
            pauseMenuBtn.addEventListener('click', () => {
                this.togglePause();
                this.returnToMenu();
            });
        }
    }
    
    /**
     * 更新按键映射
     */
    updateKeyMap(keys) {
        // 更新按键映射
        logger.debug('Key map updated:', keys);
    }
}
