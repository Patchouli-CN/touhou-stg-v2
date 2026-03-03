import { logger } from "../utils/Logger.js";

/**
 * AudioEngine - 音频引擎类（优化版）
 * 核心功能：实时流式BPM检测、增强重音检测、支持暂停/恢复播放位置
 * 优化：改进高速BPM识别，增加多频段分析
 */
export class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.audioElement = null;
        this.mediaSourceNode = null;
        this.analyser = null;
        this.gainNode = null;
        
        // 播放位置跟踪
        this.pausedAt = 0;
        this.isActuallyPlaying = false;
        
        // BPM相关
        this.bpm = 128;
        this.beatInterval = 60 / this.bpm;
        this.firstBeatTime = 0;
        
        // 实时BPM检测状态 - 优化版
        this.bpmDetection = this.createBPMDetectionState();
        
        // 增强的重音检测
        this.onsetDetector = this.createOnsetDetectorState();
        
        // 节奏追踪
        this.currentBeat = 0;
        this.currentMeasure = 0;
        this.beatProgress = 0;
        this.beatInMeasure = 0;
        
        // 鼓点检测 - 优化版
        this.beatDetector = this.createBeatDetectorState();
        
        // 多频段能量历史
        this.energyHistory = {
            bass: [],
            mid: [],
            high: [],
            full: []
        };
        
        // 节拍类型
        this.BEAT_TYPE = {
            KICK: 'kick',
            SNARE: 'snare',
            HIHAT: 'hihat',
            ACCENT: 'accent',
            DROP: 'drop',
            BUILDUP: 'buildup'
        };
        
        // 尾杀时间设置
        this.climaxSettings = {
            enabled: false,
            climaxTime: 0,
            climaxDuration: 30,
            isInClimax: false,
            buildupStart: 0,
            intensityMultiplier: 1.5
        };
        
        // 回调函数
        this.callbacks = {
            beat: [],
            measure: [],
            drum: [],
            accent: [],
            climax: [],
            update: [],
            bpmUpdate: []
        };
        
        // 状态
        this.isPlaying = false;
        this.isInitialized = false;
        this.hasAudioFile = false;
        this.isWarmupComplete = false;
        
        // 可视化数据
        this.frequencyData = null;
        this.timeDomainData = null;
        
        // 节拍器
        this.metronome = {
            active: false,
            interval: null,
            beat: 0
        };
        
        // 文件信息
        this.fileName = '';
        this.fileDuration = 0;
        
        // 分析循环
        this.analysisFrame = null;
        
        // 修复：添加标志位跟踪是否已连接
        this.isSourceNodeConnected = false;
        this.currentAudioUrl = null; // 跟踪当前音频URL
        
        // 新增：节奏分析优化参数
        this.rhythmAnalysis = {
            lastOnsetTime: 0,
            onsetHistory: [],
            bpmHistory: [],
            confidenceHistory: [],
            tempoHypotheses: new Array(200).fill(0), // 40-240 BPM 的假设
            lastBeatTime: 0,
            beatTimes: [],
            subBeatTimes: [], // 细分节拍
            phaseLock: 0, // 相位锁定
            beatStrength: 0
        };
    }
    
    // 状态创建辅助方法 - 优化版
    createBPMDetectionState() {
        return {
            isDetecting: false,
            onsetHistory: [],
            bpmCandidates: [],
            currentBPM: 128,
            confidence: 0,
            sampleCount: 0,
            startTime: 0,
            isStable: false,
            warmupTime: 2.0, // 减少预热时间
            analysisWindow: 8.0, // 缩短分析窗口，更快响应BPM变化
            lastOnsetTime: 0,
            minOnsetInterval: 0.08, // 减小最小间隔，支持更高BPM
            lastEnergy: 0,
            
            // 新增：多尺度分析
            onsetScales: [0.05, 0.1, 0.2], // 不同尺度的 onset 检测
            scaleOnsets: [[], [], []],
            
            // 新增：自相关分析
            autocorrelation: [],
            acfPeaks: [],
            
            // 新增：实时BPM平滑
            bpmBuffer: [],
            bpmBufferSize: 10
        };
    }
    
    createOnsetDetectorState() {
        return {
            bandEnergies: {
                subBass: [], bass: [], lowMid: [], mid: [], high: []
            },
            historySize: 43, // 增大历史窗口
            threshold: {
                subBass: 1.6, bass: 1.4, lowMid: 1.3, mid: 1.2, high: 1.3
            },
            adaptiveThreshold: true,
            silenceThreshold: 0.02,
            accentBeats: [],
            lastAccentTime: 0,
            minAccentInterval: 0.08, // 减小间隔，支持高速
            spectralFlux: [], // 频谱通量
            phaseDeviation: [] // 相位偏差
        };
    }
    
    createBeatDetectorState() {
        return {
            energyHistory: [],
            historySize: 86, // 增大历史窗口（约2秒@43hz）
            threshold: 1.25,
            lastBeatTime: 0,
            minBeatInterval: 0.12, // 减小最小间隔，支持更高BPM (500BPM)
            bassEnergy: 0,
            midEnergy: 0,
            highEnergy: 0,
            isBeat: false,
            beatStrength: 0,
            beatTypes: [],
            
            // 新增：多频段独立检测
            bandEnergies: {
                bass: { history: [], threshold: 1.3, lastBeat: 0 },
                mid: { history: [], threshold: 1.2, lastBeat: 0 },
                high: { history: [], threshold: 1.15, lastBeat: 0 }
            },
            
            // 新增：节奏模式识别
            patternHistory: [],
            currentPattern: null,
            patternConfidence: 0
        };
    }
    
    async init() {
        if (this.isInitialized) return;
        
        try {
            // 每次初始化时创建新的 AudioContext
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            this.audioElement = document.createElement('audio');
            this.audioElement.crossOrigin = 'anonymous';
            
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 0.7;
            
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048; // 减小FFT大小以提高响应速度
            this.analyser.smoothingTimeConstant = 0.1; // 减少平滑，提高实时性
            
            this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
            this.timeDomainData = new Uint8Array(this.analyser.frequencyBinCount);
            
            this.isInitialized = true;
            logger.info('AudioEngine initialized with optimized settings');
            
        } catch (error) {
            logger.fatal('AudioEngine init failed:', error);
        }
    }
    
    /**
     * 加载音频文件
     */
    async loadAudioFile(file) {
        if (!this.isInitialized) await this.init();
        
        this.fileName = file.name;
        
        try {
            // 清理之前的URL
            if (this.currentAudioUrl) {
                URL.revokeObjectURL(this.currentAudioUrl);
                this.currentAudioUrl = null;
            }
            
            const objectUrl = URL.createObjectURL(file);
            this.currentAudioUrl = objectUrl;
            
            // 确保使用新的audio元素
            if (this.audioElement) {
                this.audioElement.pause();
                this.audioElement.src = '';
                this.audioElement.load();
            } else {
                this.audioElement = document.createElement('audio');
                this.audioElement.crossOrigin = 'anonymous';
            }
            
            this.audioElement.src = objectUrl;
            
            await new Promise((resolve, reject) => {
                this.audioElement.onloadedmetadata = resolve;
                this.audioElement.onerror = () => reject(new Error('Failed to load audio'));
                if (this.audioElement.duration) resolve();
            });
            
            this.fileDuration = this.audioElement.duration;
            
            if (this.fileDuration > 60) {
                this.setClimaxTime(this.fileDuration - 30, 30);
            }
            
            this.hasAudioFile = true;
            this.metronome.active = false;
            this.resetBPMDetection();
            
            // 重置连接标志
            this.isSourceNodeConnected = false;
            
            return {
                success: true,
                fileName: this.fileName,
                duration: this.fileDuration,
                ready: true
            };
            
        } catch (error) {
            logger.error('Failed to load audio file:', error);
            return { success: false, error: error.message };
        }
    }
    
    resetBPMDetection() {
        this.bpmDetection = this.createBPMDetectionState();
        this.onsetDetector = this.createOnsetDetectorState();
        this.beatDetector = this.createBeatDetectorState();
        this.isWarmupComplete = false;
        this.bpm = 128;
        this.beatInterval = 60 / 128;
        this.climaxSettings.isInClimax = false;
        
        // 重置节奏分析
        this.rhythmAnalysis = {
            lastOnsetTime: 0,
            onsetHistory: [],
            bpmHistory: [],
            confidenceHistory: [],
            tempoHypotheses: new Array(200).fill(0),
            lastBeatTime: 0,
            beatTimes: [],
            subBeatTimes: [],
            phaseLock: 0,
            beatStrength: 0
        };
        
        // 重置能量历史
        this.energyHistory = {
            bass: [],
            mid: [],
            high: [],
            full: []
        };
    }
    
    /**
     * 启动节拍器模式
     */
    startMetronomeMode() {
        this.metronome.active = true;
        this.isPlaying = true;
        this.metronome.beat = 0;
        this.hasAudioFile = false;
        this.isWarmupComplete = true;
        
        const beatDuration = this.beatInterval * 1000;
        
        this.metronome.interval = setInterval(() => {
            this.metronome.beat++;
            this.currentBeat = this.metronome.beat;
            this.beatInMeasure = (this.metronome.beat - 1) % 4;
            
            const isAccent = this.metronome.beat % 8 === 0;
            const beatType = this.beatInMeasure === 0 ? this.BEAT_TYPE.KICK :
                            this.beatInMeasure === 2 ? this.BEAT_TYPE.SNARE :
                            this.BEAT_TYPE.HIHAT;
            const strength = isAccent ? 1.5 : (this.beatInMeasure === 0 ? 1.0 : 0.7);
            
            if (isAccent) {
                this.triggerCallbacks('accent', this.BEAT_TYPE.ACCENT, 1.0, this.metronome.beat);
            }
            
            this.triggerCallbacks('drum', beatType, strength, this.metronome.beat);
            this.processBeatCallbacks(this.metronome.beat, 0);
            
            if (this.beatInMeasure === 0) {
                this.currentMeasure = Math.floor(this.metronome.beat / 4);
                this.triggerCallbacks('measure', this.currentMeasure);
            }
            
        }, beatDuration);
        
        this.triggerCallbacks('drum', this.BEAT_TYPE.KICK, 1.0, 0);
    }
    
    stopMetronomeMode() {
        this.metronome.active = false;
        if (this.metronome.interval) {
            clearInterval(this.metronome.interval);
            this.metronome.interval = null;
        }
    }
    
    /**
     * 播放音频 - 修复版
     */
    async play() {
        if (!this.isInitialized) return;
        
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        if (this.hasAudioFile && this.audioElement) {
            // 恢复播放位置
            if (this.pausedAt > 0) {
                this.audioElement.currentTime = this.pausedAt;
            }
            
            // 关键修复：检查是否已经有 MediaElementSourceNode
            if (!this.mediaSourceNode) {
                try {
                    // 创建新的 MediaElementSourceNode
                    this.mediaSourceNode = this.audioContext.createMediaElementSource(this.audioElement);
                    this.mediaSourceNode.connect(this.analyser);
                    this.analyser.connect(this.gainNode);
                    this.gainNode.connect(this.audioContext.destination);
                    this.isSourceNodeConnected = true;
                    logger.debug('Created new MediaElementSourceNode');
                } catch (error) {
                    logger.error('Failed to create MediaElementSourceNode:', error);
                    // 如果创建失败，可能是因为已经连接了，尝试直接播放
                    await this.audioElement.play();
                    this.isPlaying = true;
                    this.isActuallyPlaying = true;
                    this.pausedAt = 0;
                    this.startStreamingAnalysis();
                    this.startBeatTracking();
                    return;
                }
            } else {
                // 如果已经有节点，确保它正确连接
                try {
                    // 检查连接状态
                    if (!this.isSourceNodeConnected) {
                        this.mediaSourceNode.disconnect();
                        this.mediaSourceNode.connect(this.analyser);
                        this.analyser.connect(this.gainNode);
                        this.gainNode.connect(this.audioContext.destination);
                        this.isSourceNodeConnected = true;
                    }
                    logger.debug('Reusing existing MediaElementSourceNode');
                } catch (e) {
                    logger.warn('Error reconnecting nodes:', e);
                    // 如果出错，重新创建
                    try {
                        this.mediaSourceNode.disconnect();
                    } catch (e) {}
                    this.mediaSourceNode = null;
                    this.isSourceNodeConnected = false;
                    
                    // 重新创建
                    this.mediaSourceNode = this.audioContext.createMediaElementSource(this.audioElement);
                    this.mediaSourceNode.connect(this.analyser);
                    this.analyser.connect(this.gainNode);
                    this.gainNode.connect(this.audioContext.destination);
                    this.isSourceNodeConnected = true;
                }
            }
            
            await this.audioElement.play();
            
            this.isPlaying = true;
            this.isActuallyPlaying = true;
            this.pausedAt = 0;
            
            this.startStreamingAnalysis();
            this.startBeatTracking();
            
        } else {
            this.startMetronomeMode();
        }
    }
    
    /**
     * 恢复播放 - 专门用于暂停后恢复
     */
    async resume() {
        if (!this.isInitialized) return;
        
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        if (this.hasAudioFile && this.audioElement) {
            // 恢复播放位置
            if (this.pausedAt > 0) {
                this.audioElement.currentTime = this.pausedAt;
            }
            
            // 直接播放，不需要重新创建节点
            await this.audioElement.play();
            
            this.isPlaying = true;
            this.isActuallyPlaying = true;
            this.pausedAt = 0;
            
            this.startStreamingAnalysis();
            this.startBeatTracking();
            
        } else {
            this.startMetronomeMode();
        }
    }
    
    /**
     * 暂停音频 - 记录当前位置，但不断开连接
     */
    pause() {
        if (this.hasAudioFile && this.audioElement) {
            this.pausedAt = this.audioElement.currentTime;
            this.audioElement.pause();
            this.isActuallyPlaying = false;
        }
        
        if (this.metronome.active) {
            this.stopMetronomeMode();
        }
        
        this.stopAnalysis();
        this.isPlaying = false;
    }
    
    /**
     * 停止音频 - 完全重置
     */
    stop() {
        this.stopMetronomeMode();
        
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
        }
        
        // 停止时断开连接，但保留节点引用
        if (this.mediaSourceNode && this.isSourceNodeConnected) {
            try {
                this.mediaSourceNode.disconnect();
            } catch (e) {}
            this.isSourceNodeConnected = false;
        }
        
        this.stopAnalysis();
        
        this.isPlaying = false;
        this.isActuallyPlaying = false;
        this.currentBeat = 0;
        this.currentMeasure = 0;
        this.beatProgress = 0;
        this.isWarmupComplete = false;
        this.climaxSettings.isInClimax = false;
        this.pausedAt = 0;
    }
    
    /**
     * 完全重置音频引擎（用于重新开始游戏）
     */
    reset() {
        this.stop();
        this.stopMetronomeMode();
        this.stopAnalysis();
        
        // 彻底销毁旧的音频节点
        if (this.mediaSourceNode) {
            try {
                this.mediaSourceNode.disconnect();
            } catch (e) {}
            this.mediaSourceNode = null;
        }
        
        // 重新创建音频元素
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.src = '';
            this.audioElement.load();
        }
        
        // 创建全新的audio元素
        const oldAudio = this.audioElement;
        this.audioElement = document.createElement('audio');
        this.audioElement.crossOrigin = 'anonymous';
        
        // 清理URL
        if (this.currentAudioUrl) {
            URL.revokeObjectURL(this.currentAudioUrl);
            this.currentAudioUrl = null;
        }
        
        // 重置所有标志
        this.isSourceNodeConnected = false;
        this.hasAudioFile = false;
        this.pausedAt = 0;
        this.isPlaying = false;
        this.isActuallyPlaying = false;
        
        // 重置BPM检测
        this.resetBPMDetection();
    }
    
    stopAnalysis() {
        if (this.analysisFrame) {
            cancelAnimationFrame(this.analysisFrame);
            this.analysisFrame = null;
        }
    }
    
    /**
     * 获取当前播放时间（秒）
     */
    getCurrentTime() {
        if (this.metronome.active) {
            return this.currentBeat * this.beatInterval;
        }
        return this.audioElement?.currentTime || 0;
    }
    
    /**
     * 实时流式分析 - 优化版
     */
    startStreamingAnalysis() {
        if (!this.analyser || !this.isPlaying) return;
        
        this.bpmDetection.startTime = this.audioContext.currentTime;
        let lastAnalysisTime = 0;
        let lastBeatCheck = 0;
        
        const analyze = () => {
            if (!this.isPlaying) return;
            
            const currentTime = this.audioContext.currentTime;
            const elapsed = this.getCurrentTime();
            
            // 获取频域数据
            this.analyser.getByteFrequencyData(this.frequencyData);
            
            // 多频段分析
            this.analyzeFrequencyBands();
            
            // 计算频谱通量（确保 lastFrequencyData 存在）
            if (!this.lastFrequencyData) {
                this.lastFrequencyData = new Uint8Array(this.frequencyData.length);
                this.lastFrequencyData.set(this.frequencyData);
            } else {
                this.computeSpectralFlux();
            }
            
            // 实时onset检测（更高频率）
            if (currentTime - lastAnalysisTime >= 0.005) { // 5ms间隔，200Hz
                this.detectOnsetMultiScale(currentTime);
                this.detectAccent(currentTime, elapsed);
                lastAnalysisTime = currentTime;
            }
            
            // 节拍检测（更高频率）
            if (currentTime - lastBeatCheck >= 0.002) { // 2ms间隔，500Hz
                this.detectBeatAdvanced(currentTime);
                lastBeatCheck = currentTime;
            }
            
            // BPM更新（每20个样本）
            if (this.bpmDetection.sampleCount % 20 === 0 && elapsed > 0.5) {
                this.updateBPMEstimateAdvanced(elapsed);
            }
            
            this.bpmDetection.sampleCount++;
            
            this.checkClimax(elapsed);
            
            this.analysisFrame = requestAnimationFrame(analyze);
        };
        
        this.analysisFrame = requestAnimationFrame(analyze);
    }
    
    /**
     * 多频段频带分析 - 优化版
     */
    analyzeFrequencyBands() {
        const binCount = this.frequencyData.length;
        const nyquist = this.audioContext.sampleRate / 2;
        
        // 更精细的频段划分
        const calculateBandEnergy = (startFreq, endFreq) => {
            const start = Math.floor(startFreq / nyquist * binCount);
            const end = Math.floor(endFreq / nyquist * binCount);
            let sum = 0;
            let peak = 0;
            for (let i = start; i < end; i++) {
                const val = this.frequencyData[i];
                sum += val;
                if (val > peak) peak = val;
            }
            const avg = sum / (end - start) / 255;
            const peakNorm = peak / 255;
            return { avg, peak, peakNorm };
        };
        
        // 计算各频段能量
        const bass = calculateBandEnergy(20, 150);
        const lowMid = calculateBandEnergy(150, 400);
        const mid = calculateBandEnergy(400, 2000);
        const high = calculateBandEnergy(2000, 8000);
        const veryHigh = calculateBandEnergy(8000, nyquist);
        
        // 更新频段能量
        const energies = {
            subBass: calculateBandEnergy(0, 60).avg,
            bass: bass.avg,
            lowMid: lowMid.avg,
            mid: mid.avg,
            high: high.avg,
            veryHigh: veryHigh.avg
        };
        
        // 更新历史
        Object.entries(energies).forEach(([band, energy]) => {
            const history = this.onsetDetector.bandEnergies[band] || [];
            history.push(energy);
            if (history.length > this.onsetDetector.historySize) {
                history.shift();
            }
            this.onsetDetector.bandEnergies[band] = history;
        });
        
        // 更新能量历史用于节拍检测
        this.energyHistory.bass.push(bass.avg);
        this.energyHistory.mid.push(mid.avg);
        this.energyHistory.high.push(high.avg);
        this.energyHistory.full.push((bass.avg + mid.avg + high.avg) / 3);
        
        // 限制历史长度
        const maxHistory = 86; // 约2秒
        ['bass', 'mid', 'high', 'full'].forEach(band => {
            if (this.energyHistory[band].length > maxHistory) {
                this.energyHistory[band].shift();
            }
        });
        
        this.beatDetector.bassEnergy = bass.avg;
        this.beatDetector.midEnergy = mid.avg;
        this.beatDetector.highEnergy = high.avg;
        
        // 存储峰值用于检测
        this.beatDetector.bassPeak = bass.peakNorm;
        this.beatDetector.midPeak = mid.peakNorm;
        this.beatDetector.highPeak = high.peakNorm;
    }
    
    /**
     * 计算频谱通量 - 用于onset检测
     */
    computeSpectralFlux() {
        if (!this.lastFrequencyData) {
            // 创建副本
            this.lastFrequencyData = new Uint8Array(this.frequencyData.length);
            this.lastFrequencyData.set(this.frequencyData);
            return;
        }
        
        let flux = 0;
        for (let i = 0; i < this.frequencyData.length; i++) {
            const diff = this.frequencyData[i] - this.lastFrequencyData[i];
            if (diff > 0) flux += diff;
        }
        
        this.onsetDetector.spectralFlux.push(flux);
        if (this.onsetDetector.spectralFlux.length > 43) {
            this.onsetDetector.spectralFlux.shift();
        }
        
        // 使用set方法复制数组
        this.lastFrequencyData.set(this.frequencyData);
    }
    
    /**
     * 多尺度onset检测 - 优化高速BPM
     */
    detectOnsetMultiScale(currentTime) {
        const detector = this.bpmDetection;
        
        // 计算不同尺度的能量
        const energies = [];
        for (let scale of detector.onsetScales) {
            const instantEnergy = this.computeEnergyWithScale(scale);
            energies.push(instantEnergy);
        }
        
        // 自适应阈值
        const alpha = 0.05;
        const localAverage = detector.sampleCount === 0 ? energies[0] :
            detector.lastEnergy * (1 - alpha) + energies[0] * alpha;
        detector.lastEnergy = localAverage;
        
        // 动态阈值
        const threshold = localAverage * 1.3 + 0.03;
        const timeSinceLastOnset = currentTime - detector.lastOnsetTime;
        
        // 多尺度判断
        let isOnset = false;
        for (let i = 0; i < energies.length; i++) {
            if (energies[i] > threshold * (1 + i * 0.1) && 
                timeSinceLastOnset > detector.minOnsetInterval * (1 - i * 0.2)) {
                isOnset = true;
                detector.scaleOnsets[i].push(currentTime);
                
                // 限制历史长度
                if (detector.scaleOnsets[i].length > 100) {
                    detector.scaleOnsets[i].shift();
                }
                break;
            }
        }
        
        if (isOnset) {
            detector.onsetHistory.push(currentTime);
            detector.lastOnsetTime = currentTime;
            
            // 限制历史长度
            const cutoff = currentTime - detector.analysisWindow;
            while (detector.onsetHistory.length > 0 && detector.onsetHistory[0] < cutoff) {
                detector.onsetHistory.shift();
            }
        }
    }
    
    /**
     * 计算带尺度的能量
     */
    computeEnergyWithScale(scale) {
        const bassWeight = 0.5;
        const midWeight = 0.3;
        const highWeight = 0.2;
        
        // 获取当前能量值，确保它们存在
        const bassEnergy = this.beatDetector?.bassEnergy || 0;
        const midEnergy = this.beatDetector?.midEnergy || 0;
        const highEnergy = this.beatDetector?.highEnergy || 0;
        
        // 根据不同尺度调整权重
        let scaledBass = bassEnergy * bassWeight;
        let scaledMid = midEnergy * midWeight;
        let scaledHigh = highEnergy * highWeight;
        
        if (scale > 0.1) {
            // 大尺度更注重低频
            scaledBass *= 1.2;
        } else {
            // 小尺度更注重高频
            scaledHigh *= 1.2;
        }
        
        return scaledBass + scaledMid + scaledHigh;
    }
    
    /**
     * 高级节拍检测 - 支持高速BPM
     */
    detectBeatAdvanced(currentTime) {
        const detector = this.beatDetector;
        
        // 多频段独立检测
        const bands = ['bass', 'mid', 'high'];
        const timeSinceLastBeat = currentTime - detector.lastBeatTime;
        
        detector.isBeat = false;
        detector.beatStrength = 0;
        
        // 如果离上次节拍太近，跳过
        if (timeSinceLastBeat < detector.minBeatInterval) return;
        
        // 计算各频段的动态阈值
        for (let band of bands) {
            const energy = this.beatDetector[`${band}Energy`];
            const history = this.energyHistory[band];
            
            if (history.length < 10) continue;
            
            // 计算均值和标准差
            const avg = history.reduce((a, b) => a + b, 0) / history.length;
            const variance = history.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / history.length;
            const stdDev = Math.sqrt(variance);
            
            // 动态阈值
            const threshold = avg + stdDev * 1.2;
            
            // 检测节拍
            if (energy > threshold && energy > 0.1) {
                const strength = (energy - avg) / stdDev;
                
                // 确定节拍类型
                let beatType = this.BEAT_TYPE.HIHAT;
                if (band === 'bass' && strength > 1.5) {
                    beatType = this.BEAT_TYPE.KICK;
                } else if (band === 'mid' && strength > 1.3) {
                    beatType = this.BEAT_TYPE.SNARE;
                } else if (band === 'high' && strength > 1.2) {
                    beatType = this.BEAT_TYPE.HIHAT;
                }
                
                detector.isBeat = true;
                detector.beatStrength = Math.min(strength, 3.0);
                detector.lastBeatTime = currentTime;
                detector.beatTypes.push({ type: beatType, time: currentTime, strength });
                
                // 触发回调
                this.triggerCallbacks('drum', beatType, strength, this.currentBeat);
                
                // 记录节拍时间用于BPM分析
                this.rhythmAnalysis.beatTimes.push(currentTime);
                if (this.rhythmAnalysis.beatTimes.length > 20) {
                    this.rhythmAnalysis.beatTimes.shift();
                }
                
                break;
            }
        }
        
        // 清理历史
        detector.beatTypes = detector.beatTypes.filter(b => currentTime - b.time < 2);
    }
    
    /**
     * 高级BPM估计 - 使用多种算法
     */
    updateBPMEstimateAdvanced(elapsed) {
        const detector = this.bpmDetection;
        
        // 方法1：基于onset间隔的直方图
        const bpmFromOnsets = this.estimateBPMFromOnsets();
        
        // 方法2：基于节拍时间的自相关
        const bpmFromBeats = this.estimateBPMFromBeats();
        
        // 方法3：基于多尺度onset
        const bpmFromMultiScale = this.estimateBPMFromMultiScale();
        
        // 综合多个估计
        let candidates = [];
        if (bpmFromOnsets > 0) candidates.push(bpmFromOnsets);
        if (bpmFromBeats > 0) candidates.push(bpmFromBeats);
        if (bpmFromMultiScale > 0) candidates.push(bpmFromMultiScale);
        
        if (candidates.length === 0) return;
        
        // 加权平均
        let weightedBPM = 0;
        let totalWeight = 0;
        
        // 给不同方法分配权重
        const weights = [0.5, 0.3, 0.2];
        candidates.forEach((bpm, i) => {
            if (i < weights.length) {
                weightedBPM += bpm * weights[i];
                totalWeight += weights[i];
            }
        });
        
        if (totalWeight > 0) {
            weightedBPM /= totalWeight;
        }
        
        // 四舍五入到最近的整数
        weightedBPM = Math.round(weightedBPM);
        
        // 验证BPM范围
        if (weightedBPM >= 60 && weightedBPM <= 240) {
            // 平滑处理
            detector.bpmBuffer.push(weightedBPM);
            if (detector.bpmBuffer.length > detector.bpmBufferSize) {
                detector.bpmBuffer.shift();
            }
            
            // 中值滤波
            const sorted = [...detector.bpmBuffer].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            
            // 计算置信度
            const consistency = detector.bpmBuffer.reduce((sum, val) => 
                sum + (Math.abs(val - median) < 5 ? 1 : 0), 0) / detector.bpmBuffer.length;
            
            const confidence = Math.min(consistency * 1.2, 1.0);
            
            // 平滑更新
            const smoothingFactor = detector.isStable ? 0.9 : 0.6;
            detector.currentBPM = detector.currentBPM * smoothingFactor + median * (1 - smoothingFactor);
            
            const newBPM = Math.round(detector.currentBPM);
            
            // 更新置信度
            detector.confidence = detector.confidence * 0.7 + confidence * 0.3;
            
            // 如果BPM变化超过阈值，触发更新
            if (Math.abs(newBPM - this.bpm) >= 2) {
                this.setBPM(newBPM);
                this.triggerCallbacks('bpmUpdate', newBPM, detector.confidence);
                logger.info(`BPM updated: ${newBPM} (confidence: ${(detector.confidence * 100).toFixed(1)}%)`);
            }
        }
        
        // 检查预热完成
        if (!this.isWarmupComplete && elapsed >= detector.warmupTime) {
            this.isWarmupComplete = true;
            detector.isStable = true;
            logger.info(`BPM stabilized at ${this.bpm} BPM`);
        }
    }
    
    /**
     * 基于onset间隔估计BPM
     */
    estimateBPMFromOnsets() {
        const onsets = this.bpmDetection.onsetHistory;
        if (onsets.length < 8) return 0;
        
        // 计算间隔
        const intervals = [];
        for (let i = 1; i < onsets.length; i++) {
            intervals.push(onsets[i] - onsets[i - 1]);
        }
        
        // 构建直方图（更高分辨率）
        const histogram = {};
        const resolution = 0.005; // 5ms分辨率，支持更高BPM
        
        intervals.forEach(interval => {
            // 量化
            const quantized = Math.round(interval / resolution) * resolution;
            histogram[quantized] = (histogram[quantized] || 0) + 1;
            
            // 也考虑二分间隔（检测半拍）
            const halfQuantized = Math.round(interval * 2 / resolution) * resolution;
            histogram[halfQuantized] = (histogram[halfQuantized] || 0) + 0.5;
        });
        
        // 找到峰值
        let bestInterval = 0;
        let maxCount = 0;
        
        Object.entries(histogram).forEach(([interval, count]) => {
            if (count > maxCount) {
                maxCount = count;
                bestInterval = parseFloat(interval);
            }
        });
        
        if (bestInterval > 0) {
            const bpm = Math.round(60 / bestInterval);
            if (bpm >= 40 && bpm <= 240) {
                return bpm;
            }
        }
        
        return 0;
    }
    
    /**
     * 基于节拍时间估计BPM
     */
    estimateBPMFromBeats() {
        const beats = this.rhythmAnalysis.beatTimes;
        if (beats.length < 6) return 0;
        
        // 计算间隔
        const intervals = [];
        for (let i = 1; i < beats.length; i++) {
            intervals.push(beats[i] - beats[i - 1]);
        }
        
        // 计算平均间隔（去除异常值）
        const sorted = [...intervals].sort((a, b) => a - b);
        const trimmed = sorted.slice(2, -2); // 去除最小和最大的两个
        
        if (trimmed.length === 0) return 0;
        
        const avgInterval = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
        const bpm = Math.round(60 / avgInterval);
        
        if (bpm >= 40 && bpm <= 240) {
            return bpm;
        }
        
        return 0;
    }
    
    /**
     * 基于多尺度onset估计BPM
     */
    estimateBPMFromMultiScale() {
        const detector = this.bpmDetection;
        let bestBPM = 0;
        let bestScore = 0;
        
        // 遍历可能的BPM范围
        for (let bpm = 60; bpm <= 240; bpm++) {
            const interval = 60 / bpm;
            let score = 0;
            
            // 检查每个尺度的onset是否符合这个间隔
            detector.onsetScales.forEach((scale, scaleIdx) => {
                const onsets = detector.scaleOnsets[scaleIdx];
                if (onsets.length < 3) return;
                
                for (let i = 1; i < onsets.length; i++) {
                    const diff = onsets[i] - onsets[i - 1];
                    const error = Math.abs(diff - interval) / interval;
                    if (error < 0.1) { // 10%误差
                        score += 1 / (1 + error * 10);
                    }
                }
            });
            
            if (score > bestScore) {
                bestScore = score;
                bestBPM = bpm;
            }
        }
        
        return bestBPM;
    }
    
    /**
     * 增强的重音检测算法
     */
    detectAccent(currentTime, elapsed) {
        const detector = this.onsetDetector;
        const timeSinceLastAccent = currentTime - detector.lastAccentTime;
        
        if (timeSinceLastAccent < detector.minAccentInterval) return;
        
        const bands = ['subBass', 'bass', 'lowMid', 'mid', 'high'];
        const stats = {};
        
        // 检查是否有足够的历史数据
        let hasEnoughData = true;
        for (const band of bands) {
            const history = detector.bandEnergies[band];
            if (!history || history.length < 10) {
                hasEnoughData = false;
                break;
            }
            
            const avg = history.reduce((a, b) => a + b, 0) / history.length;
            const variance = history.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / history.length;
            
            stats[band] = {
                current: history[history.length - 1],
                avg: avg,
                stdDev: Math.sqrt(variance)
            };
        }
        
        if (!hasEnoughData) return;
        
        let accentType = null;
        let accentStrength = 0;
        
        const { subBass, bass, lowMid, mid, high } = stats;
        
        // 检测DROP（大量低频）
        if (subBass?.current > subBass.avg + subBass.stdDev * 2.0 && subBass.current > 0.4) {
            accentType = this.BEAT_TYPE.DROP;
            accentStrength = subBass.current;
        }
        // 检测重拍（低频+中频）
        else if (bass?.current > bass.avg + bass.stdDev * 1.6 && bass.current > 0.3 && 
                lowMid?.current > lowMid.avg + lowMid.stdDev * 1.2) {
            accentType = this.BEAT_TYPE.ACCENT;
            accentStrength = (bass.current + lowMid.current) / 2;
        }
        // 检测军鼓（中频突出）
        else if (lowMid?.current > lowMid.avg + lowMid.stdDev * 1.5 && lowMid.current > 0.25 &&
                bass.current < lowMid.current * 1.5) {
            accentType = this.BEAT_TYPE.SNARE;
            accentStrength = lowMid.current;
        }
        // 检测Build up（高频上升）
        else if (high?.current > high.avg + high.stdDev * 1.4 && high.current > 0.2 &&
                this.isHighFrequencyRising()) {
            accentType = this.BEAT_TYPE.BUILDUP;
            accentStrength = high.current;
        }
        
        if (accentType && accentStrength > 0.2) {
            detector.lastAccentTime = currentTime;
            detector.accentBeats.push({ type: accentType, time: currentTime, strength: accentStrength });
            detector.accentBeats = detector.accentBeats.filter(a => currentTime - a.time < 3);
            
            this.triggerCallbacks('accent', accentType, accentStrength, this.currentBeat);
            this.triggerCallbacks('drum', accentType, accentStrength, this.currentBeat);
        }
    }
    
    isHighFrequencyRising() {
        const highHistory = this.onsetDetector.bandEnergies.high;
        if (highHistory.length < 15) return false;
        
        let risingCount = 0;
        for (let i = highHistory.length - 10; i < highHistory.length - 1; i++) {
            if (highHistory[i + 1] > highHistory[i]) risingCount++;
        }
        
        return risingCount >= 7;
    }
    
    /**
     * 高潮检测
     */
    checkClimax(elapsed) {
        if (!this.climaxSettings.enabled) return;
        
        const wasInClimax = this.climaxSettings.isInClimax;
        const { climaxTime, climaxDuration, buildupStart } = this.climaxSettings;
        
        const inClimax = elapsed >= climaxTime && elapsed < climaxTime + climaxDuration;
        const inBuildup = elapsed >= buildupStart && elapsed < climaxTime;
        
        this.climaxSettings.isInClimax = inClimax;
        
        if (!wasInClimax && inClimax) {
            logger.info('🔥 CLIMAX STARTED! 🔥');
            this.triggerCallbacks('climax', 'start', this.climaxSettings.intensityMultiplier);
        } else if (wasInClimax && !inClimax) {
            logger.info('Climax ended');
            this.triggerCallbacks('climax', 'end', 1.0);
        }
        
        if (inBuildup && Math.floor(elapsed * 10) % 5 === 0) {
            const buildupProgress = (elapsed - buildupStart) / (climaxTime - buildupStart);
            this.triggerCallbacks('climax', 'buildup', 1.0 + buildupProgress * 0.5);
        }
    }
    
    // 统一的回调触发方法
    triggerCallbacks(type, ...args) {
        if (this.callbacks[type]) {
            this.callbacks[type].forEach(cb => {
                try {
                    cb(...args);
                } catch (e) {
                    logger.error(`Error in ${type} callback:`, e);
                }
            });
        }
    }
    
    // 注册回调方法
    onDrumHit(callback) {
        this.callbacks.drum.push(callback);
        return () => { this.callbacks.drum = this.callbacks.drum.filter(cb => cb !== callback); };
    }
    
    onAccent(callback) {
        this.callbacks.accent.push(callback);
        return () => { this.callbacks.accent = this.callbacks.accent.filter(cb => cb !== callback); };
    }
    
    onClimax(callback) {
        this.callbacks.climax.push(callback);
        return () => { this.callbacks.climax = this.callbacks.climax.filter(cb => cb !== callback); };
    }
    
    onBPMUpdate(callback) {
        this.callbacks.bpmUpdate.push(callback);
        return () => { this.callbacks.bpmUpdate = this.callbacks.bpmUpdate.filter(cb => cb !== callback); };
    }
    
    onBeat(callback, subdivision = 1) {
        const handler = { callback, subdivision, lastBeat: -1 };
        this.callbacks.beat.push(handler);
        return () => this.offBeat(callback);
    }
    
    offBeat(callback) {
        this.callbacks.beat = this.callbacks.beat.filter(cb => cb.callback !== callback);
    }
    
    onMeasure(callback) {
        this.callbacks.measure.push(callback);
        return () => { this.callbacks.measure = this.callbacks.measure.filter(cb => cb !== callback); };
    }
    
    onUpdate(callback) {
        this.callbacks.update.push(callback);
        return () => { this.callbacks.update = this.callbacks.update.filter(cb => cb !== callback); };
    }
    
    predictNextBeat(beatType = null) {
        const currentTime = this.getCurrentTime();
        const progress = this.getBeatProgress();
        const timeToNext = (1 - progress) * this.beatInterval;
        
        return { time: currentTime + timeToNext, progress, timeToNext };
    }
    
    isNearBeat(windowMs = 30) {
        const progress = this.getBeatProgress();
        const windowProgress = windowMs / 1000 / this.beatInterval;
        return progress < windowProgress || progress > (1 - windowProgress);
    }
    
    startBeatTracking() {
        const track = () => {
            if (!this.isPlaying) return;
            
            const currentTime = this.getCurrentTime();
            const exactBeat = currentTime / this.beatInterval;
            const currentBeatInt = Math.floor(exactBeat);
            this.beatProgress = exactBeat - currentBeatInt;
            this.beatInMeasure = currentBeatInt % 4;
            
            if (currentBeatInt !== this.currentBeat) {
                this.currentBeat = currentBeatInt;
                this.processBeatCallbacks(currentBeatInt, this.beatProgress);
                
                const currentMeasure = Math.floor(currentBeatInt / 4);
                if (currentMeasure !== this.currentMeasure) {
                    this.currentMeasure = currentMeasure;
                    this.triggerCallbacks('measure', currentMeasure);
                }
            }
            
            this.triggerCallbacks('update', currentTime, this.beatProgress);
            
            requestAnimationFrame(track);
        };
        
        requestAnimationFrame(track);
    }
    
    processBeatCallbacks(beat, progress) {
        this.callbacks.beat.forEach(cb => {
            const subdivisionBeat = Math.floor(beat / cb.subdivision);
            if (subdivisionBeat !== cb.lastBeat) {
                cb.lastBeat = subdivisionBeat;
                cb.callback(beat, progress);
            }
        });
    }
    
    setBPM(bpm) {
        this.bpm = bpm;
        this.beatInterval = 60 / bpm;
    }
    
    getCurrentBeat() { return this.currentBeat; }
    getBeatProgress() { return this.beatProgress; }
    
    isOnBeat(tolerance = 0.08) {
        const progress = this.getBeatProgress();
        return progress < tolerance || progress > (1 - tolerance);
    }
    
    getIntensity() {
        if (!this.frequencyData) return 0;
        const sum = this.frequencyData.reduce((a, b) => a + b, 0);
        return sum / this.frequencyData.length / 255;
    }
    
    getBassIntensity() { return this.beatDetector.bassEnergy; }
    getMidIntensity() { return this.beatDetector.midEnergy; }
    getHighIntensity() { return this.beatDetector.highEnergy; }
    
    getAudioInfo() {
        return {
            fileName: this.fileName,
            duration: this.fileDuration,
            bpm: this.bpm,
            confidence: this.bpmDetection.confidence,
            isWarmupComplete: this.isWarmupComplete,
            hasAudioFile: this.hasAudioFile,
            isDetecting: this.bpmDetection.isDetecting,
            isInClimax: this.climaxSettings.isInClimax,
            climaxTime: this.climaxSettings.climaxTime
        };
    }
    
    getBPMStatus() {
        return {
            bpm: this.bpm,
            confidence: this.bpmDetection.confidence,
            isWarmupComplete: this.isWarmupComplete,
            elapsed: this.isPlaying ? this.getCurrentTime() : 0,
            onsetCount: this.bpmDetection.onsetHistory.length,
            accentCount: this.onsetDetector.accentBeats.length,
            isInClimax: this.climaxSettings.isInClimax
        };
    }
    
    setClimaxTime(timeInSeconds, duration = 30) {
        Object.assign(this.climaxSettings, {
            climaxTime: timeInSeconds,
            climaxDuration: duration,
            enabled: true,
            buildupStart: Math.max(0, timeInSeconds - 15)
        });
        logger.info(`Climax set at ${timeInSeconds}s, duration ${duration}s`);
    }
}
