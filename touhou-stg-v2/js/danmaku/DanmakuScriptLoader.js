import {
    StarDanmaku,
    ArrowDanmaku,
    RandomDanmaku,
    SpiralDanmaku,
    MagicCircleDanmaku,
    MasterSparkDanmaku,
    BounceDanmaku,
    SplitDanmaku,
    FlowerDanmaku,
    WaveDanmaku
} from "./DanmakuPattern.js"
import { Vector2 } from "../utils/Vector2.js";
import { logger } from "../utils/Logger.js";

/**
 * DanmakuScriptLoader - 弹幕脚本加载器
 * 支持节奏同步：让弹幕发射频率跟随音乐节拍
 */
export class DanmakuScriptLoader {
    constructor() {
        this.scripts = new Map();
        this.audioEngine = null;

        this.patternClasses = {
            'StarDanmaku': StarDanmaku,
            'ArrowDanmaku': ArrowDanmaku,
            'RandomDanmaku': RandomDanmaku,
            'SpiralDanmaku': SpiralDanmaku,
            'MagicCircleDanmaku': MagicCircleDanmaku,
            'MasterSparkDanmaku': MasterSparkDanmaku,
            'BounceDanmaku': BounceDanmaku,
            'SplitDanmaku': SplitDanmaku,
            'FlowerDanmaku': FlowerDanmaku,
            'WaveDanmaku': WaveDanmaku
        };
        
        // 节奏同步状态
        this.beatState = {
            lastBeat: -1,
            beatCount: 0,
            beatInterval: 0.5,
            nextBeatTime: 0,
            currentBeat: 0,
            beatProgress: 0
        };
        
        // 存储每个模式的最后发射节拍
        this.lastFireBeat = new Map();
    }
    
    /**
     * 设置音频引擎
     */
    setAudioEngine(audioEngine) {
        this.audioEngine = audioEngine;
        
        if (audioEngine) {
            // 监听节拍事件
            audioEngine.onBeat((beat, progress) => {
                this.onBeat(beat, progress);
            });
            
            // 监听鼓点事件
            audioEngine.onDrumHit((drumType, strength, beat) => {
                this.onDrumHit(drumType, strength, beat);
            });
            
            // 更新节拍间隔
            audioEngine.onBPMUpdate((bpm) => {
                this.beatState.beatInterval = 60 / bpm;
                logger.debug(`BPM updated: ${bpm}, interval: ${this.beatState.beatInterval}`);
            });
        }
    }
    
    /**
     * 节拍回调
     */
    onBeat(beat, progress) {
        this.beatState.lastBeat = beat;
        this.beatState.beatCount++;
        this.beatState.currentBeat = beat;
        this.beatState.beatProgress = progress;
        this.beatState.nextBeatTime = performance.now() / 1000 + this.beatState.beatInterval * (1 - progress);
    }
    
    /**
     * 鼓点回调
     */
    onDrumHit(drumType, strength, beat) {
        this.beatState.lastDrumType = drumType;
        this.beatState.lastDrumStrength = strength;
        this.beatState.lastDrumBeat = beat;
    }
    
    /**
     * 加载脚本文件
     */
    async loadScript(url) {
        try {
            const response = await fetch(url);
            const script = await response.json();
            this.scripts.set(script.name, script);
            logger.info('Loaded script:', script.name);
            return script;
        } catch (error) {
            logger.error('Failed to load danmaku script:', error);
            return null;
        }
    }
    
    /**
     * 根据脚本创建Boss阶段
     */
    createPhasesFromScript(script, bulletPool) {
        return script.phases.map(phaseData => this.createPhase(phaseData, bulletPool));
    }

    /**
     * 创建单个阶段
     */
    createPhase(phaseData, bulletPool) {
        // 创建攻击模式映射
        const attackPatterns = {};
        
        phaseData.attackPatterns.forEach(patternData => {
            // 为每个模式创建一个唯一的键用于跟踪最后发射节拍
            const patternKey = `${patternData.type}_${patternData.pattern}`;
            
            // 创建节奏同步版本的攻击模式
            attackPatterns[patternData.type] = (boss, player, pool, strength, drumType) => {
                return this.executeRhythmPattern(
                    patternData, boss, player, pool, strength, drumType, patternKey
                );
            };
        });
        
        // 创建移动模式
        const movePattern = this.createMovePattern(
            phaseData.movePattern || 'static',
            phaseData.moveSpeed || 100
        );
        
        return {
            name: phaseData.name,
            health: phaseData.health,
            spellCard: phaseData.spellCard,
            time: phaseData.time || 60,
            movePattern: movePattern,
            attackPatterns: attackPatterns,
            rhythm: phaseData.rhythm || { type: 'beat', subdivision: 1 },
            onEnter: (boss) => {
                // 如果有符卡名称，触发符卡宣言
                if (phaseData.spellCard && phaseData.spellCard.name) {
                    if (window.game) {
                        window.game.showSpellCardBanner(
                            phaseData.spellCard.name,
                            phaseData.spellCard.image
                        );
                    }
                }
                logger.info(`Entering phase: ${phaseData.name}`);
                
                // 清空最后发射记录
                this.lastFireBeat.clear();
            },
            onEnd: (boss) => {
                logger.info(`Phase ended: ${phaseData.name}`);
            }
        };
    }
    
    /**
     * 执行节奏同步的弹幕模式
     */
    executeRhythmPattern(patternData, boss, player, pool, strength, currentDrumType, patternKey) {
        if (!this.audioEngine) {
            logger.warn('Audio engine not set');
            return [];
        }
        
        const rhythm = patternData.rhythm || { type: 'beat', subdivision: 1 };
        let shouldFire = false;
        let fireReason = '';
        
        // 获取当前节拍
        const currentBeat = this.beatState.currentBeat;
        
        // 获取该模式上次发射的节拍
        const lastFire = this.lastFireBeat.get(patternKey) || -1;
        
        // 根据节奏类型判断是否应该发射
        switch (rhythm.type) {
            case 'beat':
                // 每N拍发射一次
                if (currentBeat % rhythm.subdivision === 0 && currentBeat !== lastFire) {
                    shouldFire = true;
                    fireReason = `beat ${rhythm.subdivision}`;
                }
                break;
                
            case 'measure':
                // 每N小节发射一次
                const measure = Math.floor(currentBeat / 4);
                if (measure % rhythm.subdivision === 0 && measure !== lastFire) {
                    shouldFire = true;
                    fireReason = `measure ${rhythm.subdivision}`;
                    this.lastFireBeat.set(patternKey, measure);
                }
                break;
                
            case 'drum':
                // 特定鼓点类型触发
                if (patternData.type === currentDrumType && currentBeat !== lastFire) {
                    shouldFire = true;
                    fireReason = `drum ${currentDrumType}`;
                }
                break;
                
            case 'accent':
                // 重拍触发（每4拍的第一拍）
                if (currentBeat % 4 === 0 && currentBeat % (rhythm.subdivision * 4) === 0 && currentBeat !== lastFire) {
                    shouldFire = true;
                    fireReason = `accent ${rhythm.subdivision}`;
                }
                break;
                
            case 'continuous':
                // 连续发射，但速度与BPM相关
                return this.executeContinuousPattern(patternData, boss, player, pool, strength);
        }
        
        if (shouldFire) {
            // 记录这次发射的节拍
            this.lastFireBeat.set(patternKey, currentBeat);
            
            // 根据强度调整弹幕数量
            const intensity = this.audioEngine.getIntensity() || 1.0;
            const drumStrength = this.beatState.lastDrumStrength || 1.0;
            const adjustedStrength = strength * intensity * drumStrength * (patternData.strengthMultiplier || 1.0);
            
            return this.executePattern(patternData, boss, player, pool, adjustedStrength);
        }
        
        return [];
    }
    
    /**
     * 执行连续发射模式（速度与BPM相关）
     */
    executeContinuousPattern(patternData, boss, player, pool, strength) {
        const PatternClass = this.patternClasses[patternData.pattern];
        if (!PatternClass) return [];
        
        const pattern = new PatternClass(pool)
            .setPosition(boss.position.x, boss.position.y)
            .setBullet(
                patternData.params.bulletType || 'normal',
                patternData.params.color || '#fff',
                patternData.params.size || 6,
                patternData.params.speed || 150
            );
        
        if (player) {
            pattern.aimAt(player);
        }
        
        // 应用额外参数
        Object.assign(pattern, patternData.params);
        
        // 根据BPM调整发射频率
        const bpm = this.audioEngine?.bpm || 120;
        const beatInterval = 60 / bpm;
        
        // 设置发射间隔为节拍间隔的几分之一
        const subdivision = patternData.rhythm?.subdivision || 4;
        pattern.fireRate = beatInterval / subdivision;
        
        return pattern.fire(player, strength);
    }
    
    /**
     * 执行弹幕模式
     */
    executePattern(patternData, boss, player, pool, strength) {
        const PatternClass = this.patternClasses[patternData.pattern];
        if (!PatternClass) {
            logger.error(`Unknown pattern: ${patternData.pattern}`);
            return [];
        }
        
        const pattern = new PatternClass(pool)
            .setPosition(boss.position.x, boss.position.y)
            .setBullet(
                patternData.params.bulletType || 'normal',
                patternData.params.color || '#fff',
                patternData.params.size || 6,
                patternData.params.speed || 150
            );
        
        if (player) {
            pattern.aimAt(player);
        }
        
        // 应用额外参数
        Object.assign(pattern, patternData.params);
        
        // 根据节奏强度调整弹幕数量
        const intensity = this.audioEngine?.getIntensity() || 1.0;
        const adjustedStrength = strength * intensity * (patternData.strengthMultiplier || 1.0);
        
        return pattern.fire(player, adjustedStrength);
    }
    
    /**
     * 创建移动模式
     */
    createMovePattern(pattern, speed) {
        switch (pattern) {
            case 'circle':
                return (boss, deltaTime, time) => {
                    const radius = 100;
                    const centerX = 300;
                    const centerY = 150;
                    boss.position.x = centerX + Math.cos(time * 0.5) * radius;
                    boss.position.y = centerY + Math.sin(time * 0.5) * radius;
                };
                
            case 'figure8':
                return (boss, deltaTime, time) => {
                    const radius = 80;
                    const centerX = 300;
                    const centerY = 150;
                    boss.position.x = centerX + Math.sin(time * 0.3) * radius;
                    boss.position.y = centerY + Math.sin(time * 0.6) * radius;
                };
                
            case 'random':
                return (boss, deltaTime, time, moveTimer) => {
                    if (!boss._moveTarget || moveTimer > 3) {
                        boss._moveTarget = {
                            x: 150 + Math.random() * 300,
                            y: 80 + Math.random() * 150
                        };
                        boss._moveTimer = 0;
                    }
                    
                    const currentPos = new Vector2(boss.position.x, boss.position.y);
                    const targetPos = new Vector2(boss._moveTarget.x, boss._moveTarget.y);
                    
                    const diff = Vector2.subtract(targetPos, currentPos);
                    
                    if (diff.length() > 5) {
                        diff.normalize();
                        diff.multiply(speed * deltaTime);
                        boss.position.add(diff);
                    } else {
                        boss.position.set(boss._moveTarget.x, boss._moveTarget.y);
                        boss._moveTarget = null;
                    }
                };
                
            case 'static':
            default:
                return () => {};
        }
    }
    
    /**
     * 注册自定义弹幕模式
     */
    registerPattern(name, patternClass) {
        this.patternClasses[name] = patternClass;
    }
}
