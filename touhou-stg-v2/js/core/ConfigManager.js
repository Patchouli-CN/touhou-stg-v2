import { BossConfigLoader } from "./BossConfigLoader.js";
import { logger } from "../utils/Logger.js";

/**
 * ConfigManager - 配置管理器
 */
export class ConfigManager {
    constructor(world) {
        this.world = world;
        this.config = this.loadConfig();
        this.defaultKeys = {
            up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
            shoot: 'z', bomb: 'x', focus: 'Shift', pause: 'Escape'
        };
        this.keys = { ...this.defaultKeys };
        this.listeningAction = null;
        
        // Boss列表
        this.bossList = [];
        this.selectedBoss = 'Boss/satori/';
        
        this.init();
    }
    
    init() {
        this.setupSidebar();
        this.setupKeyBinding();
        this.setupSettings();
        this.loadBossList();
        this.applyConfig();
        
        logger.info('ConfigManager initialized');
    }
    
    loadConfig() {
        const defaults = {
            hitboxMode: 'normal',
            bgEffect: 'stars',
            bgBrightness: 0.7,
            bgBlur: 0,
            bgParallax: true,
            bgPreset: 'default',
            sfxVolume: 0.7,
            musicVolume: 0.7,
            showHitbox: true,
            showFps: true,
            screenShake: true,
            showBeatIndicator: true,
            particleEffects: true,
            godMode: false,
            showDebugInfo: false,
            slowMotion: false,
            customKeys: {},
            selectedBoss: 'Boss/satori/'
        };
        
        try {
            const saved = localStorage.getItem('touhouConfig');
            return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
        } catch {
            logger.warn('Failed to load config from localStorage, using defaults');
            return defaults;
        }
    }
    
    saveConfig() {
        try {
            localStorage.setItem('touhouConfig', JSON.stringify(this.config));
            this.showToast('设置已保存！');
            logger.info('Config saved');
        } catch (error) {
            logger.error('Failed to save config:', error);
        }
    }
    
    /**
     * 加载Boss列表
     */
    async loadBossList() {
        const bossSelector = document.getElementById('bossSelector');
        if (!bossSelector) return;
        
        try {
            bossSelector.innerHTML = '<div class="bossLoading">加载Boss列表中...</div>';
            
            if (!this.world.bossConfigLoader) {
                this.world.bossConfigLoader = new BossConfigLoader();
            }
            
            const bosses = await this.world.bossConfigLoader.scanBosses();
            
            if (bosses && bosses.length > 0) {
                this.bossList = bosses;
                this.renderBossList(bosses);
            } else {
                this.showDefaultBossOptions();
            }
        } catch (error) {
            logger.error('Failed to load boss list:', error);
            this.showDefaultBossOptions();
        }
    }
    
    /**
     * 显示默认Boss选项
     */
    showDefaultBossOptions() {
        const bossSelector = document.getElementById('bossSelector');
        if (!bossSelector) return;
        
        bossSelector.innerHTML = '';
        
        const defaultBosses = [
            { id: 'satori', name: '古明地觉', path: 'Boss/satori/', icon: '👁️', title: '怨灵也为之惧怯的少女' },
            { id: 'koishi', name: '古明地恋', path: 'Boss/koishi/', icon: '❤️', title: '紧闭的恋之瞳' }
        ];
        
        defaultBosses.forEach(boss => {
            const card = document.createElement('div');
            card.className = 'bossCard';
            card.dataset.path = boss.path;
            if (boss.path === this.config.selectedBoss) {
                card.classList.add('active');
            }
            
            card.innerHTML = `
                <div class="bossIcon">${boss.icon}</div>
                <div class="bossName">${boss.name}</div>
                <div class="bossTitle">${boss.title}</div>
            `;
            
            card.addEventListener('click', () => this.selectBoss(boss.path, boss));
            bossSelector.appendChild(card);
        });
        
        this.bossList = defaultBosses;
        logger.info('Using default boss options');
    }
    
    /**
     * 渲染Boss列表
     */
    renderBossList(bosses) {
        const bossSelector = document.getElementById('bossSelector');
        if (!bossSelector) return;
        
        bossSelector.innerHTML = '';
        
        bosses.forEach(boss => {
            const card = document.createElement('div');
            card.className = 'bossCard';
            card.dataset.path = boss.path;
            if (boss.path === this.config.selectedBoss) {
                card.classList.add('active');
            }
            
            const baseUrl = this.world?.serverBaseUrl || 'http://127.0.0.1:9123/';
            const bossName = boss.path.split('/').filter(p => p).pop() || boss.id;
            const iconUrl = boss.icon ? `${baseUrl}Boss/${bossName}/${boss.icon}` : null;
            
            card.innerHTML = `
                ${iconUrl ? 
                    `<img src="${iconUrl}" class="bossIcon" alt="${boss.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : 
                    ''
                }
                <div class="bossIcon" style="display: ${iconUrl ? 'none' : 'flex'};">👾</div>
                <div class="bossName">${boss.name}</div>
                <div class="bossTitle">${boss.description || ''}</div>
            `;
            
            card.addEventListener('click', () => this.selectBoss(boss.path, boss));
            bossSelector.appendChild(card);
        });
        
        logger.info(`Rendered ${bosses.length} bosses`);
    }
    
    /**
     * 选择Boss
     */
    selectBoss(path, bossInfo) {
        document.querySelectorAll('.bossCard').forEach(c => c.classList.remove('active'));
        const selectedCard = document.querySelector(`.bossCard[data-path="${path}"]`);
        if (selectedCard) selectedCard.classList.add('active');
        
        this.config.selectedBoss = path;
        this.selectedBoss = path;
        
        const infoContainer = document.getElementById('selectedBossInfo');
        const nameEl = document.getElementById('selectedBossName');
        const titleEl = document.getElementById('selectedBossTitle');
        const versionEl = document.getElementById('selectedBossVersion');
        const currentBossEl = document.getElementById('currentBossName');
        
        if (infoContainer) infoContainer.classList.remove('hidden');
        if (nameEl) nameEl.textContent = bossInfo.name || 'Unknown';
        if (titleEl) titleEl.textContent = bossInfo.title || bossInfo.description || '';
        if (versionEl) versionEl.textContent = bossInfo.version || '1.0.0';
        if (currentBossEl) currentBossEl.textContent = bossInfo.name || 'Unknown';
        
        if (this.world) {
            this.world.selectedBossPath = path;
        }
        
        this.saveConfig();
        this.showToast(`已选择Boss: ${bossInfo.name}`);
        logger.info(`Boss selected: ${bossInfo.name}`);
    }
    
    setupSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggle = document.getElementById('sidebarToggle');
        
        toggle?.addEventListener('click', () => {
            sidebar?.classList.toggle('collapsed');
        });
    }
    
    setupKeyBinding() {
        document.querySelectorAll('.keyBindBtn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (action === 'move') {
                    this.startKeyListening('up');
                    setTimeout(() => this.startKeyListening('down'), 100);
                    setTimeout(() => this.startKeyListening('left'), 200);
                    setTimeout(() => this.startKeyListening('right'), 300);
                } else {
                    this.startKeyListening(action);
                }
            });
        });
        
        document.getElementById('resetKeysBtn')?.addEventListener('click', () => {
            this.keys = { ...this.defaultKeys };
            this.updateKeyDisplay();
            this.config.customKeys = {};
            this.saveConfig();
            logger.info('Keys reset to default');
        });
        
        document.addEventListener('keydown', (e) => {
            if (this.listeningAction) {
                e.preventDefault();
                this.setKey(this.listeningAction, e.key);
                this.listeningAction = null;
            }
        });
    }
    
    startKeyListening(action) {
        this.listeningAction = action;
        const inputId = 'key' + action.charAt(0).toUpperCase() + action.slice(1);
        const input = document.getElementById(inputId);
        if (input) {
            input.classList.add('listening');
            input.value = '按下按键...';
        }
        
        setTimeout(() => {
            if (this.listeningAction === action) {
                this.listeningAction = null;
                this.updateKeyDisplay();
            }
        }, 3000);
    }
    
    setKey(action, key) {
        this.keys[action] = key;
        this.config.customKeys[action] = key;
        this.updateKeyDisplay();
        
        if (window.game) window.game.updateKeyMap(this.keys);
        this.saveConfig();
        logger.info(`Key bound: ${action} = ${key}`);
    }
    
    updateKeyDisplay() {
        Object.entries(this.keys).forEach(([action, key]) => {
            const inputId = 'key' + action.charAt(0).toUpperCase() + action.slice(1);
            const input = document.getElementById(inputId);
            if (input) {
                input.classList.remove('listening');
                const displayKey = key.replace('Arrow', '').replace('Escape', 'Esc');
                input.value = displayKey;
            }
        });
    }
    
    setupSettings() {
        // 判定模式
        const hitboxSelect = document.getElementById('hitboxSelect');
        if (hitboxSelect) {
            hitboxSelect.value = this.config.hitboxMode;
            hitboxSelect.addEventListener('change', (e) => {
                this.config.hitboxMode = e.target.value;
                if (window.game) window.game.hitboxMode = e.target.value;
                this.saveConfig();
            });
        }
        
        // 背景效果
        const bgEffectSelect = document.getElementById('bgEffectSelect');
        if (bgEffectSelect) {
            bgEffectSelect.value = this.config.bgEffect;
            bgEffectSelect.addEventListener('change', (e) => {
                this.config.bgEffect = e.target.value;
                this.saveConfig();
            });
        }
        
        // 背景亮度
        this.setupSlider('bgBrightness', 'bgBrightnessValue', 'bgBrightness', (v) => `${Math.round(v * 100)}%`, (val) => {
            if (this.world && this.world.bgConfig) {
                this.world.bgConfig.brightness = val;
            }
        });
        
        // 背景模糊
        this.setupSlider('bgBlur', 'bgBlurValue', 'bgBlur', (v) => `${v}px`, (val) => {
            if (this.world && this.world.bgConfig) {
                this.world.bgConfig.blur = val;
            }
        });
        
        // 音量
        this.setupSlider('sfxVolume', 'sfxVolumeValue', 'sfxVolume', (v) => `${Math.round(v * 100)}%`);
        this.setupSlider('musicVolume', 'musicVolumeValue', 'musicVolume', (v) => {
            if (window.game?.audioEngine?.gainNode) {
                window.game.audioEngine.gainNode.gain.value = v;
            }
            return `${Math.round(v * 100)}%`;
        });
        
        // 背景预设
        document.querySelectorAll('.bgPreset').forEach(preset => {
            preset.addEventListener('click', () => {
                document.querySelectorAll('.bgPreset').forEach(p => p.classList.remove('active'));
                preset.classList.add('active');
                
                const bgPreset = preset.dataset.bg;
                this.config.bgPreset = bgPreset;
                
                if (bgPreset === 'custom') {
                    document.getElementById('bgUpload')?.click();
                }
                
                this.applyBackgroundConfig();
                this.saveConfig();
            });
        });
        
        // 背景上传
        document.getElementById('bgUpload')?.addEventListener('change', async (e) => {
            if (e.target.files[0]) {
                if (this.world && this.world.loadCustomBackground) {
                    await this.world.loadCustomBackground(e.target.files[0]);
                    this.config.bgPreset = 'custom';
                    
                    document.querySelectorAll('.bgPreset').forEach(p => p.classList.remove('active'));
                    document.querySelector('[data-bg="custom"]')?.classList.add('active');
                    
                    this.saveConfig();
                }
            }
        });
        
        // 视差效果复选框
        const bgParallax = document.getElementById('bgParallax');
        if (bgParallax) {
            bgParallax.checked = this.config.bgParallax;
            bgParallax.addEventListener('change', (e) => {
                this.config.bgParallax = e.target.checked;
                if (this.world && this.world.bgConfig) {
                    this.world.bgConfig.parallax = e.target.checked;
                }
                this.saveConfig();
            });
        }
        
        // 复选框
        ['showHitbox', 'showFps', 'showBeatIndicator', 'screenShake', 'particleEffects', 
         'godMode', 'showDebugInfo', 'slowMotion'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.checked = this.config[id];
                el.addEventListener('change', (e) => {
                    this.config[id] = e.target.checked;
                    
                    if (id === 'godMode' && window.game && window.game.player) {
                        if (e.target.checked && !window.game.player.godMode) {
                            window.game.player.toggleGodMode();
                        } else if (!e.target.checked && window.game.player.godMode) {
                            window.game.player.toggleGodMode();
                        }
                    }
                    
                    this.saveConfig();
                });
            }
        });
        
        // 按钮
        document.getElementById('saveConfigBtn')?.addEventListener('click', () => this.saveConfig());
        document.getElementById('resetConfigBtn')?.addEventListener('click', () => {
            if (confirm('恢复默认设置？')) {
                localStorage.removeItem('touhouConfig');
                location.reload();
            }
        });
    }
    
    /**
     * 设置滑块控件
     */
    setupSlider(id, valueId, configKey, format, onChange = null) {
        const slider = document.getElementById(id);
        const value = document.getElementById(valueId);
        if (!slider || !value) return;
        
        slider.value = this.config[configKey];
        value.textContent = format(this.config[configKey]);
        
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.config[configKey] = val;
            value.textContent = format(val);
            
            if (onChange) {
                onChange(val);
            }
        });
    }
    
    /**
     * 应用背景配置到游戏
     */
    applyBackgroundConfig() {
        if (!this.world) return;
        
        this.world.updateBackground({
            preset: this.config.bgPreset,
            brightness: this.config.bgBrightness,
            blur: this.config.bgBlur,
            parallax: this.config.bgParallax
        });
    }
    
    /**
     * 应用所有配置
     */
    applyConfig() {
        if (this.config.customKeys) {
            Object.assign(this.keys, this.config.customKeys);
            this.updateKeyDisplay();
        }
        
        if (window.game) {
            window.game.hitboxMode = this.config.hitboxMode;
            window.game.selectedBossPath = this.config.selectedBoss;
        }
        
        this.applyBackgroundConfig();
        
        if (window.game?.audioEngine?.gainNode) {
            window.game.audioEngine.gainNode.gain.value = this.config.musicVolume;
        }
        
        document.querySelectorAll('.bgPreset').forEach(p => {
            if (p.dataset.bg === this.config.bgPreset) {
                p.classList.add('active');
            } else {
                p.classList.remove('active');
            }
        });
    }
    
    showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: linear-gradient(135deg, #9b59b6, #e74c3c);
            color: #fff; padding: 12px 24px; border-radius: 8px;
            font-size: 14px; font-weight: 700; z-index: 10000;
            box-shadow: 0 0 20px rgba(231, 76, 60, 0.5);
            animation: fadeInOut 3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
    
    getKeyMap() { return this.keys; }
}
