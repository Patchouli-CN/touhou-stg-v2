import { Vector2 } from "../utils/Vector2.js";
import { logger } from "../utils/Logger.js";

/**
 * DanmakuPattern - 弹幕发射器基类
 */
export class DanmakuPattern {
    constructor(bulletPool) {
        this.bulletPool = bulletPool;
        
        // 发射器属性
        this.position = new Vector2();
        this.angle = -Math.PI / 2;
        this.speed = 150;
        
        // 弹幕属性
        this.bulletType = 'normal';
        this.bulletColor = '#fff';
        this.bulletSize = 6;
        
        // 发射控制
        this.fireRate = 0.1;
        this.fireTimer = 0;
        
        // 激光预警配置
        this.enableLaserWarning = true;
        this.laserWarningDuration = 1.0;
    }
    
    /**
     * 设置发射器位置
     */
    setPosition(x, y) {
        this.position.set(x, y);
        return this;
    }
    
    /**
     * 设置发射角度
     */
    setAngle(angle) {
        this.angle = angle;
        return this;
    }
    
    /**
     * 设置朝向目标的角度
     */
    aimAt(target) {
        this.angle = this.position.angleTo(target.position || target);
        return this;
    }
    
    /**
     * 设置弹幕属性
     */
    setBullet(type, color, size, speed) {
        this.bulletType = type;
        this.bulletColor = color;
        this.bulletSize = size;
        if (speed !== undefined) this.speed = speed;
        return this;
    }
    
    /**
     * 设置发射速率
     */
    setFireRate(rate) {
        this.fireRate = rate;
        return this;
    }
    
    /**
     * 更新发射器
     */
    update(deltaTime) {
        this.fireTimer += deltaTime;
    }
    
    /**
     * 尝试发射
     */
    tryFire(deltaTime, target = null, strength = 1) {
        this.update(deltaTime);
        
        if (this.fireTimer >= this.fireRate) {
            this.fireTimer = 0;
            return this.fire(target, strength);
        }
        
        return [];
    }
    
    /**
     * 发射弹幕（子类必须实现）
     */
    fire(target, strength = 1) {
        throw new Error('子类必须实现 fire 方法');
    }
    
    /**
     * 创建单个弹幕的辅助方法
     */
    _createBullet(angle, speed, size = null, color = null, type = null) {
        const velocity = Vector2.fromAngle(angle, speed);
        
        return this.bulletPool.acquire(
            this.position.x,
            this.position.y,
            velocity,
            type || this.bulletType,
            color || this.bulletColor,
            size || this.bulletSize,
            'enemy'
        );
    }
    
    /**
     * 创建多个角度弹幕的辅助方法
     */
    _createBulletsFan(count, totalAngle, speed = null, size = null) {
        const bullets = [];
        const startAngle = this.angle - totalAngle / 2;
        const angleStep = totalAngle / (count - 1);
        
        for (let i = 0; i < count; i++) {
            const angle = startAngle + angleStep * i;
            const bullet = this._createBullet(angle, speed || this.speed, size);
            if (bullet) bullets.push(bullet);
        }
        
        return bullets;
    }
    
    /**
     * 创建环形弹幕的辅助方法
     */
    _createBulletsCircle(count, speed = null, size = null, rotationOffset = 0) {
        const bullets = [];
        const angleStep = (Math.PI * 2) / count;
        
        for (let i = 0; i < count; i++) {
            const angle = this.angle + angleStep * i + rotationOffset;
            const bullet = this._createBullet(angle, speed || this.speed, size);
            if (bullet) bullets.push(bullet);
        }
        
        return bullets;
    }
}

// ==================== 具体弹幕实现 ====================

/**
 * StarDanmaku - 星形弹幕
 */
export class StarDanmaku extends DanmakuPattern {
    constructor(bulletPool) {
        super(bulletPool);
        this.setBullet('star', '#ffd700', 8, 180);
    }
    
    fire(target, strength = 1) {
        const count = 5 + Math.floor(strength * 3);
        const speed = this.speed * (0.8 + strength * 0.4);
        
        return this._createBulletsFan(count, Math.PI / 3, speed);
    }
}

/**
 * MagicCircleDanmaku - 魔法阵环形弹幕
 */
export class MagicCircleDanmaku extends DanmakuPattern {
    constructor(bulletPool) {
        super(bulletPool);
        this.setBullet('ball', '#ff69b4', 10, 160);
        this.spinAngle = 0;
        this.spinSpeed = 0.5;
    }
    
    update(deltaTime) {
        super.update(deltaTime);
        this.spinAngle += this.spinSpeed;
    }
    
    fire(target, strength = 1) {
        const count = 12 + Math.floor(strength * 8);
        const speed = this.speed * (0.9 + strength * 0.3);
        
        return this._createBulletsCircle(count, speed, null, this.spinAngle);
    }
}

/**
 * MasterSparkDanmaku - 极限火花激光（原作风格，从Boss身上直接发射）
 */
export class MasterSparkDanmaku extends DanmakuPattern {
    constructor(bulletPool) {
        super(bulletPool);
        this.setBullet('laser', '#d7d7d7', 6, 400);
        this.laserWidth = 40;
        this.warningDuration = 1.0;
    }
    
    /**
     * 发射激光 - 从Boss位置直接发射，无飞行过程
     */
    fire(target, strength = 1) {
        const boss = this.getBossFromContext();
        if (!boss) return [];
        
        // 锁定Boss当前位置（激光起点）
        const startX = boss.position.x;
        const startY = boss.position.y;
        const angle = boss.position.angleTo(target.position);
        
        logger.debug(`MasterSpark: origin=(${startX.toFixed(1)}, ${startY.toFixed(1)}), angle=${angle.toFixed(2)}`);
        
        // 暂停Boss移动
        boss.setMoving(false);
        
        const bullets = [];
        const count = Math.floor(strength) || 1;
        
        for (let i = 0; i < count; i++) {
            const offset = (i - (count - 1) / 2) * 0.15;
            const finalAngle = angle + offset;
            
            // 创建激光子弹，速度为0但角度正确存储
            const velocity = Vector2.fromAngle(finalAngle, 0.001); // 极小速度保持方向
            
            const bullet = this.bulletPool.acquire(
                startX, startY, velocity,
                'laser',
                '#eae029',
                this.laserWidth,
                'enemy'
            );
            
            if (bullet) {
                // 设置激光属性
                bullet.setLaser(this.laserWidth, 800, 2000);
                bullet.startWarning(this.warningDuration, '#ff0000');
                
                // 关键：单独存储激光角度，不依赖速度
                bullet.laserAngle = finalAngle;
                bullet.isFixedPosition = true;
                bullet.fixedX = startX;
                bullet.fixedY = startY;
                
                bullets.push(bullet);
            }
        }
        
        // 预警完成后恢复Boss移动
        setTimeout(() => {
            if (boss) boss.setMoving(true);
        }, this.warningDuration * 1000);
        
        return bullets;
    }
    
    getBossFromContext() {
        return window.game?.boss;
    }
}

/**
 * ArrowDanmaku - 箭形弹幕（高速弹）
 */
export class ArrowDanmaku extends DanmakuPattern {
    constructor(bulletPool) {
        super(bulletPool);
        this.setBullet('arrow', '#ff4444', 6, 280);
    }
    
    fire(target, strength = 1) {
        const aimedAngle = this.position.angleTo(target.position);
        const spreadCount = 3 + Math.floor(strength * 2);
        const bullets = [];
        
        for (let i = 0; i < spreadCount; i++) {
            const offset = (i - (spreadCount - 1) / 2) * 0.2;
            const bullet = this._createBullet(aimedAngle + offset, this.speed * (0.9 + strength * 0.2));
            if (bullet) bullets.push(bullet);
        }
        
        return bullets;
    }
}

/**
 * BounceDanmaku - 反弹弹幕
 */
export class BounceDanmaku extends DanmakuPattern {
    constructor(bulletPool) {
        super(bulletPool);
        this.setBullet('bounce', '#ff8800', 8, 200);
    }
    
    fire(target, strength = 1) {
        const count = 4 + Math.floor(strength * 2);
        const bullets = [];
        
        for (let i = 0; i < count; i++) {
            const angle = this.angle + (Math.random() - 0.5) * Math.PI / 2;
            const bullet = this._createBullet(angle, this.speed * (0.8 + Math.random() * 0.4));
            if (bullet) {
                bullet.setBounce(2 + Math.floor(strength), 0.85);
                bullets.push(bullet);
            }
        }
        
        return bullets;
    }
}

/**
 * SplitDanmaku - 分裂弹幕
 */
export class SplitDanmaku extends DanmakuPattern {
    constructor(bulletPool) {
        super(bulletPool);
        this.setBullet('split', '#00ffff', 10, 150);
    }
    
    fire(target, strength = 1) {
        const count = 3 + Math.floor(strength);
        const bullets = [];
        
        for (let i = 0; i < count; i++) {
            const angle = this.angle + (i - (count - 1) / 2) * 0.3;
            const bullet = this._createBullet(angle, this.speed);
            if (bullet) {
                bullet.setSplit(3 + Math.floor(strength), 1.5);
                bullets.push(bullet);
            }
        }
        
        return bullets;
    }
}

/**
 * FlowerDanmaku - 花形弹幕
 */
export class FlowerDanmaku extends DanmakuPattern {
    constructor(bulletPool) {
        super(bulletPool);
        this.setBullet('ball', '#ff69b4', 7, 140);
        this.petals = 5;
    }
    
    fire(target, strength = 1) {
        const bullets = [];
        const petals = this.petals + Math.floor(strength * 2);
        const density = 6 + Math.floor(strength * 4);
        
        for (let p = 0; p < petals; p++) {
            const petalAngle = (Math.PI * 2 * p) / petals;
            
            for (let i = 0; i < density; i++) {
                const t = i / density;
                const angle = petalAngle + Math.sin(t * Math.PI) * 0.3;
                const speed = this.speed * (0.5 + t * 0.5);
                
                const bullet = this._createBullet(angle, speed);
                if (bullet) bullets.push(bullet);
            }
        }
        
        return bullets;
    }
}

/**
 * SpiralDanmaku - 螺旋弹幕
 */
export class SpiralDanmaku extends DanmakuPattern {
    constructor(bulletPool) {
        super(bulletPool);
        this.setBullet('star', '#ffd700', 6, 160);
        this.spinAngle = 0;
        this.arms = 3;
    }
    
    update(deltaTime) {
        super.update(deltaTime);
        this.spinAngle += 2 * deltaTime;
    }
    
    fire(target, strength = 1) {
        const bullets = [];
        const arms = this.arms + Math.floor(strength);
        const bulletsPerArm = 8;
        
        for (let arm = 0; arm < arms; arm++) {
            const armOffset = (Math.PI * 2 * arm) / arms;
            
            for (let i = 0; i < bulletsPerArm; i++) {
                const angle = this.spinAngle + armOffset + (i * 0.3);
                const speed = this.speed * (1 + i * 0.1);
                
                const bullet = this._createBullet(angle, speed, this.bulletSize * (1 - i * 0.05));
                if (bullet) bullets.push(bullet);
            }
        }
        
        return bullets;
    }
}

/**
 * RandomDanmaku - 随机散布弹幕
 */
export class RandomDanmaku extends DanmakuPattern {
    constructor(bulletPool) {
        super(bulletPool);
        this.setBullet('small', '#ff88cc', 4, 200);
    }
    
    fire(target, strength = 1) {
        const count = 5 + Math.floor(strength * 5);
        const spreadAngle = Math.PI / 3;
        const bullets = [];
        
        for (let i = 0; i < count; i++) {
            const angle = this.angle + (Math.random() - 0.5) * spreadAngle * 2;
            const speed = this.speed * (0.7 + Math.random() * 0.6);
            
            const bullet = this._createBullet(angle, speed);
            if (bullet) bullets.push(bullet);
        }
        
        return bullets;
    }
}

/**
 * WaveDanmaku - 波浪弹幕
 */
export class WaveDanmaku extends DanmakuPattern {
    constructor(bulletPool) {
        super(bulletPool);
        this.setBullet('ball', '#ff1493', 6, 180);
        this.waveOffset = 0;
    }
    
    update(deltaTime) {
        super.update(deltaTime);
        this.waveOffset += 3 * deltaTime;
    }
    
    fire(target, strength = 1) {
        const bullets = [];
        const count = 7 + Math.floor(strength * 5);
        const waveAmp = 0.5;
        
        for (let i = 0; i < count; i++) {
            const t = i / (count - 1);
            const wave = Math.sin(t * Math.PI * 2 + this.waveOffset) * waveAmp;
            const angle = this.angle + wave;
            
            const bullet = this._createBullet(angle, this.speed);
            
            // 检查子弹是否成功创建
            if (!bullet) {
                logger.warn('Failed to create bullet (pool full?)');
                continue;
            }
            
            // 设置曲线行为
            bullet.setBehavior('curve');
            
            // 设置曲线参数
            if (bullet.behavior) {
                bullet.behavior.curveRate = wave * 0.1;
            }
            
            bullets.push(bullet);
        }
        
        return bullets;
    }
}