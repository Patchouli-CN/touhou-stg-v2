import { Entity } from "./Entity.js";
import { Vector2 } from "../utils/Vector2.js";
import { logger } from "../utils/Logger.js";

/**
 * Bullet - 弹幕基类（重构版）
 * 使用组合模式，行为由BulletBehavior策略决定
 */
export class Bullet extends Entity {
    constructor() {
        super();
        
        // 基础属性
        this.owner = null;
        this.type = 'normal';
        this.damage = 1;
        this.color = '#fff';
        this.size = 4;
        this.glowSize = 0;
        
        // 运动属性
        this.baseSpeed = 0;
        this.maxSpeed = 1000;
        
        // 渲染
        this.rotation = 0;
        this.rotationSpeed = 0;
        this.scale = 1;
        this.alpha = 1;
        
        // 生命周期
        this.maxAge = 10;
        
        // 擦弹标记
        this.hasGrazed = false;
        this.grazeRadius = 0;
        
        // 尾迹效果
        this.trail = [];
        this.maxTrailLength = 10;
        
        // 粒子效果
        this.particleTimer = 0;
        this.particleInterval = 0.05;
        
        // 行为策略
        this.behavior = null;
        
        // 激光专用属性（用于兼容）
        this.laserWidth = 4;
        this.laserLength = 0;
        this.laserMaxLength = 800;
        this.isLaserExtending = false;
        
        // 预警系统
        this.isWarning = false;
        this.warningTimer = 0;
        this.warningDuration = 1.0;
        this.warningColor = '#ff0000';
    }
    
    /**
     * 重置弹幕
     */
    reset(x, y, velocity, type = 'normal', color = '#fff', size = 4, owner = 'enemy') {
        super.reset(x, y);
        
        this.velocity = velocity.clone ? velocity.clone() : new Vector2(velocity.x || 0, velocity.y || 0);
        this.baseSpeed = this.velocity.length();
        
        this.type = type;
        this.color = color;
        this.size = size;
        this.owner = owner;
        this.damage = owner === 'player' ? 10 : 1;
        
        this.rotation = 0;
        this.rotationSpeed = 0;
        this.scale = 1;
        this.alpha = 1;
        this.maxAge = 10;
        this.hasGrazed = false;
        this.grazeRadius = size * 3;
        this.glowSize = size * 1.5;
        
        this.trail = [];
        this.maxTrailLength = 10;
        this.particleTimer = 0;
        
        // 重置激光属性
        this.laserWidth = size;
        this.laserLength = 0;
        this.laserMaxLength = 800;
        this.isLaserExtending = type === 'laser';
        
        // 重置预警
        this.isWarning = false;
        this.warningTimer = 0;
        
        // 设置行为策略
        this.setBehavior(type);
        
        return this;
    }
    
    /**
     * 设置行为策略
     */
    setBehavior(type) {
        logger.debug(`Setting behavior: type=${type}, current behavior=${this.behavior?.constructor.name || 'null'}`);
        this.behavior = BulletBehaviorFactory.create(type, this);
        logger.debug(`Behavior set: ${this.behavior?.constructor.name || 'null'}`);
    }

    setBehaviorParam(param, value) {
        if (this.behavior) {
            this.behavior[param] = value;
        }
        return this;
    }
    
    /**
     * 设置激光属性
     */
    setLaser(width, maxLength, extendSpeed = 2000) {
        this.type = 'laser';
        this.laserWidth = width;
        this.laserMaxLength = maxLength;
        this.isLaserExtending = true;
        this.setBehavior('laser');
        if (this.behavior) {
            this.behavior.extendSpeed = extendSpeed;
        }
        return this;
    }
    
    /**
     * 设置反弹属性
     */
    setBounce(count, damping = 0.85) {
        this.type = 'bounce';
        this.setBehavior('bounce');
        if (this.behavior) {
            this.behavior.bounceCount = count;
            this.behavior.bounceDamping = damping;
        }
        return this;
    }
    
    /**
     * 设置分裂属性
     */
    setSplit(count, delay = 1.5) {
        this.type = 'split';
        this.setBehavior('split');
        if (this.behavior) {
            this.behavior.splitCount = count;
            this.behavior.splitDelay = delay;
        }
        return this;
    }
    
    /**
     * 启动激光预警
     */
    startWarning(duration = 1.0, warningColor = '#ff0000') {
        if (this.type !== 'laser') {
            logger.warn('Warning can only be applied to laser bullets');
            return this;
        }
        this.isWarning = true;
        this.warningDuration = duration;
        this.warningColor = warningColor;
        this.warningTimer = 0;
        logger.debug('Laser warning started, duration:', duration);
        return this;
    }
    
    /**
     * 更新弹幕
     */
    update(deltaTime) {
        if (!this.isActive) return;
        
        super.update(deltaTime);
        
        // 检查生命周期
        if (this.age >= this.maxAge) {
            this.destroy();
            return;
        }
        
        // 更新尾迹（优化：每2帧更新一次）
        if (Math.floor(this.age * 60) % 2 === 0) {
            this.updateTrail();
        }
        
        // 执行行为策略
        if (this.behavior) {
            this.behavior.update(this, deltaTime);
        }
        
        // 更新旋转
        this.rotation += this.rotationSpeed * deltaTime * 60;
        
        // 粒子效果
        this.particleTimer += deltaTime;
        if (this.particleTimer >= this.particleInterval) {
            this.particleTimer = 0;
        }
    }
    
    /**
     * 更新尾迹
     */
    updateTrail() {
        if (!Array.isArray(this.trail)) {
            this.trail = [];
        }
        
        this.trail.push({
            x: this.position.x,
            y: this.position.y,
            age: 0
        });
        
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }
        
        this.trail.forEach(point => point.age += 0.1);
    }
    
    /**
     * 渲染弹幕
     */
    draw(ctx) {
        ctx.save();
        ctx.rotate(this.rotation);
        ctx.scale(this.scale, this.scale);
        ctx.globalAlpha = this.alpha;
        
        // 发光效果
        if (this.glowSize > 0) {
            ctx.shadowColor = this.color;
            ctx.shadowBlur = this.glowSize;
        }
        
        // 绘制尾迹
        this.drawTrail(ctx);
        
        // 使用行为策略绘制
        if (this.behavior) {
            this.behavior.draw(this, ctx);
        } else {
            this.drawDefault(ctx);
        }
        
        ctx.restore();
    }
    
    /**
     * 绘制尾迹
     */
    drawTrail(ctx) {
        if (this.trail.length < 2) return;
        
        ctx.save();
        ctx.globalAlpha = 0.3;
        
        for (let i = 0; i < this.trail.length - 1; i++) {
            const point = this.trail[i];
            const alpha = 1 - point.age;
            if (alpha <= 0) continue;
            
            ctx.globalAlpha = alpha * 0.3;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(point.x - this.position.x, point.y - this.position.y, 
                   this.size * (1 - i / this.trail.length), 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    /**
     * 默认绘制
     */
    drawDefault(ctx) {
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size);
        gradient.addColorStop(0, '#fff');
        gradient.addColorStop(0.5, this.color);
        gradient.addColorStop(1, this._darkenColor(this.color, 0.5));
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
    
    /**
     * 颜色工具函数
     */
    _darkenColor(color, factor) {
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgb(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)})`;
        }
        return color;
    }
    
    _lightenColor(color, factor) {
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgb(${Math.min(255, Math.floor(r + (255 - r) * factor))}, 
                       ${Math.min(255, Math.floor(g + (255 - g) * factor))}, 
                       ${Math.min(255, Math.floor(b + (255 - b) * factor))})`;
        }
        return color;
    }
    
    cleanup() {
        this.target = null;
        this.owner = null;
        this.behavior = null;
        this.trail = [];
    }
}

// ==================== 行为策略类 ====================

/**
 * BulletBehavior - 弹幕行为基类
 */
class BulletBehavior {
    update(bullet, deltaTime) {
        // 子类重写
    }
    
    draw(bullet, ctx) {
        // 子类重写
    }
}

/**
 * 普通弹幕行为
 */
class NormalBehavior extends BulletBehavior {
    update(bullet, deltaTime) {
        bullet.position.add(Vector2.multiply(bullet.velocity, deltaTime));
        
        // 边界检查
        if (bullet.position.x < -50 || bullet.position.x > 650 ||
            bullet.position.y < -50 || bullet.position.y > 850) {
            bullet.destroy();
        }
    }
    
    draw(bullet, ctx) {
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, bullet.size);
        gradient.addColorStop(0, '#fff');
        gradient.addColorStop(0.5, bullet.color);
        gradient.addColorStop(1, bullet._darkenColor(bullet.color, 0.5));
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, bullet.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * 激光行为 - 带预警功能
 */
class LaserBehavior extends BulletBehavior {
    constructor() {
        super();
        this.extendSpeed = 2000;
        this.warningComplete = false;
        this.laserDuration = 2.0; // 激光持续存在时间（秒）
    }
    
    update(bullet, deltaTime) {
        // 固定位置激光：不更新位置，保持在发射点
        if (bullet.isFixedPosition) {
            bullet.position.x = bullet.fixedX;
            bullet.position.y = bullet.fixedY;
        }
        
        // 预警阶段 - 无敌，不造成伤害
        if (bullet.isWarning) {
            bullet.warningTimer += deltaTime;
            bullet.isDangerous = false; // 预警期间不危险
            
            if (bullet.warningTimer >= bullet.warningDuration) {
                bullet.isWarning = false;
                bullet.isLaserExtending = true;
                bullet.isDangerous = true; // 现在开始危险！
                bullet.laserLife = this.laserDuration; // 设置激光寿命
                logger.debug('Laser warning complete, now DANGEROUS!');
            }
            return;
        }
        
        // 激光延伸阶段
        if (bullet.isLaserExtending) {
            bullet.laserLength += this.extendSpeed * deltaTime;
            if (bullet.laserLength >= bullet.laserMaxLength) {
                bullet.laserLength = bullet.laserMaxLength;
                bullet.isLaserExtending = false; // 延伸完成，进入持续阶段
                logger.debug('Laser fully extended');
            }
        }
        
        // 激光持续阶段 - 倒计时
        if (!bullet.isWarning && !bullet.isLaserExtending && bullet.laserLife > 0) {
            bullet.laserLife -= deltaTime;
            
            // 激光即将消失前闪烁警告
            if (bullet.laserLife < 0.5) {
                bullet.alpha = 0.5 + Math.sin(bullet.age * 20) * 0.5;
            }
            
            // 激光结束
            if (bullet.laserLife <= 0) {
                bullet.destroy();
                logger.debug('Laser expired');
            }
        }
    }
    
    draw(bullet, ctx) {
        // 使用存储的激光角度，优先于速度角度
        const angle = bullet.laserAngle !== undefined ? bullet.laserAngle : bullet.velocity.angle();
        
        ctx.save();
        ctx.rotate(angle + Math.PI / 2);
        
        // 预警阶段绘制
        if (bullet.isWarning) {
            this.drawWarning(bullet, ctx, angle);
            ctx.restore();
            return;
        }
        
        // 激光主体绘制
        this.drawLaserBody(bullet, ctx);
        
        ctx.restore();
    }
    
    drawWarning(bullet, ctx, angle) {  // 接收 angle 参数
        // 闪烁效果
        const flashAlpha = 0.3 + Math.sin(bullet.warningTimer * 15) * 0.2;
        const progress = bullet.warningTimer / bullet.warningDuration;
        
        // 预警线（半透明）- 宽度与激光伤害判定一致
        ctx.shadowColor = bullet.warningColor;
        ctx.shadowBlur = 10;
        ctx.globalAlpha = flashAlpha * (1 - progress * 0.3);
        
        // 渐变预警线
        const warningGradient = ctx.createLinearGradient(0, 0, 0, -bullet.laserMaxLength);
        warningGradient.addColorStop(0, bullet.warningColor);
        warningGradient.addColorStop(0.5, `rgba(255, 100, 0, ${0.5 - progress * 0.3})`);
        warningGradient.addColorStop(1, 'rgba(255, 0, 0, 0.1)');
        
        ctx.fillStyle = warningGradient;
        // 使用 laserWidth 作为宽度，保持与伤害判定一致
        ctx.fillRect(-bullet.laserWidth / 2, -bullet.laserMaxLength, bullet.laserWidth, bullet.laserMaxLength);
        
        // 绘制预警边框
        ctx.strokeStyle = `rgba(255, 255, 0, ${0.8 - progress * 0.3})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.strokeRect(-bullet.laserWidth / 2, -bullet.laserMaxLength, bullet.laserWidth, bullet.laserMaxLength);
        ctx.setLineDash([]);
        
        // 倒计时指示器
        const remaining = Math.ceil((bullet.warningDuration - bullet.warningTimer) * 10) / 10;
        ctx.restore();
        ctx.save();
        ctx.translate(bullet.position.x, bullet.position.y);
        ctx.rotate(angle);
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 10;
        ctx.fillText(remaining.toFixed(1), 0, -bullet.laserMaxLength / 2);
        
        ctx.restore();
    }
    
    drawLaserBody(bullet, ctx) {
        // 激光主体渐变
        const gradient = ctx.createLinearGradient(0, 0, 0, -bullet.laserLength);
        gradient.addColorStop(0, bullet.color);
        gradient.addColorStop(0.7, bullet._lightenColor(bullet.color, 0.5));
        gradient.addColorStop(1, 'transparent');
        
        // 外发光
        ctx.shadowColor = bullet.color;
        ctx.shadowBlur = 20;
        ctx.globalAlpha = 1;
        
        ctx.fillStyle = gradient;
        ctx.fillRect(-bullet.laserWidth / 2, -bullet.laserLength, bullet.laserWidth, bullet.laserLength);
        
        // 核心高亮
        ctx.shadowBlur = 5;
        ctx.fillStyle = '#fff';
        ctx.fillRect(-bullet.laserWidth / 4, -bullet.laserLength, bullet.laserWidth / 2, bullet.laserLength);
        
        // 发射点光环
        const pulse = 1 + Math.sin(bullet.age * 20) * 0.2;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, bullet.laserWidth * pulse, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * 追踪弹行为
 */
class HomingBehavior extends BulletBehavior {
    constructor() {
        super();
        this.homingStrength = 0.08;
        this.target = null;
    }
    
    update(bullet, deltaTime) {
        if (this.target && this.target.isActive) {
            const targetAngle = bullet.position.angleTo(this.target.position);
            const currentAngle = bullet.velocity.angle();
            let angleDiff = targetAngle - currentAngle;
            
            // 规范化角度差
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            
            bullet.velocity.rotate(angleDiff * this.homingStrength * deltaTime * 60);
        }
        
        bullet.position.add(Vector2.multiply(bullet.velocity, deltaTime));
        
        // 边界检查
        if (bullet.position.x < -50 || bullet.position.x > 650 ||
            bullet.position.y < -50 || bullet.position.y > 850) {
            bullet.destroy();
        }
    }
    
    draw(bullet, ctx) {
        // 主体
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, bullet.size);
        gradient.addColorStop(0, '#fff');
        gradient.addColorStop(0.4, bullet.color);
        gradient.addColorStop(1, bullet._darkenColor(bullet.color, 0.3));
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, bullet.size, 0, Math.PI * 2);
        ctx.fill();
        
        // 方向指示器
        const angle = bullet.velocity.angle();
        ctx.save();
        ctx.rotate(angle);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(bullet.size * 1.5, 0);
        ctx.lineTo(-bullet.size * 0.5, -bullet.size * 0.5);
        ctx.lineTo(-bullet.size * 0.5, bullet.size * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

/**
 * 反弹弹行为
 */
class BounceBehavior extends BulletBehavior {
    constructor() {
        super();
        this.bounceCount = 3;
        this.bounceDamping = 0.85;
        this.bounds = { left: 0, right: 600, top: 0, bottom: 800 };
    }
    
    update(bullet, deltaTime) {
        bullet.position.add(Vector2.multiply(bullet.velocity, deltaTime));
        
        let bounced = false;
        
        // 边界反弹
        if (bullet.position.x < this.bounds.left + bullet.size) {
            bullet.velocity.x = Math.abs(bullet.velocity.x) * this.bounceDamping;
            bullet.position.x = this.bounds.left + bullet.size;
            bounced = true;
        } else if (bullet.position.x > this.bounds.right - bullet.size) {
            bullet.velocity.x = -Math.abs(bullet.velocity.x) * this.bounceDamping;
            bullet.position.x = this.bounds.right - bullet.size;
            bounced = true;
        }
        
        if (bullet.position.y < this.bounds.top + bullet.size) {
            bullet.velocity.y = Math.abs(bullet.velocity.y) * this.bounceDamping;
            bullet.position.y = this.bounds.top + bullet.size;
            bounced = true;
        } else if (bullet.position.y > this.bounds.bottom - bullet.size) {
            bullet.velocity.y = -Math.abs(bullet.velocity.y) * this.bounceDamping;
            bullet.position.y = this.bounds.bottom - bullet.size;
            bounced = true;
        }
        
        if (bounced) {
            this.bounceCount--;
            if (this.bounceCount < 0) {
                bullet.destroy();
            }
        }
    }
    
    draw(bullet, ctx) {
        // 六边形
        ctx.fillStyle = bullet.color;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI * 2) / 6 - Math.PI / 2;
            const x = Math.cos(angle) * bullet.size;
            const y = Math.sin(angle) * bullet.size;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        
        // 内部反弹次数显示
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${bullet.size}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.bounceCount.toString(), 0, 0);
    }
}

/**
 * 分裂弹行为
 */
class SplitBehavior extends BulletBehavior {
    constructor() {
        super();
        this.splitCount = 3;
        this.splitDelay = 1.5;
        this.splitTimer = 0;
        this.splitTriggered = false;
        this.onSplit = null; // 分裂回调
    }
    
    update(bullet, deltaTime) {
        this.splitTimer += deltaTime;
        
        if (!this.splitTriggered && this.splitTimer >= this.splitDelay) {
            this.splitTriggered = true;
            this.triggerSplit(bullet);
        }
        
        bullet.position.add(Vector2.multiply(bullet.velocity, deltaTime));
        
        // 边界检查
        if (bullet.position.x < -50 || bullet.position.x > 650 ||
            bullet.position.y < -50 || bullet.position.y > 850) {
            bullet.destroy();
        }
    }
    
    triggerSplit(bullet) {
        if (this.onSplit) {
            const bullets = [];
            const angleStep = (Math.PI * 2) / this.splitCount;
            const baseAngle = bullet.velocity.angle();
            
            for (let i = 0; i < this.splitCount; i++) {
                const angle = baseAngle + angleStep * i;
                const speed = bullet.velocity.length() * 0.8;
                const velocity = Vector2.fromAngle(angle, speed);
                
                bullets.push({
                    position: bullet.position.clone(),
                    velocity: velocity,
                    type: 'small',
                    color: bullet.color,
                    size: bullet.size * 0.6
                });
            }
            
            this.onSplit(bullets);
        }
        
        bullet.destroy();
    }
    
    draw(bullet, ctx) {
        // 核心
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, bullet.size);
        gradient.addColorStop(0, '#fff');
        gradient.addColorStop(0.5, bullet.color);
        gradient.addColorStop(1, bullet._darkenColor(bullet.color, 0.5));
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, bullet.size, 0, Math.PI * 2);
        ctx.fill();
        
        // 倒计时环
        const progress = 1 - (this.splitTimer / this.splitDelay);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, bullet.size * 1.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.stroke();
    }
}

/**
 * 加速弹行为
 */
class AccelerateBehavior extends BulletBehavior {
    constructor() {
        super();
        this.accelerationRate = 150;
        this.maxSpeed = 600;
    }
    
    update(bullet, deltaTime) {
        const currentSpeed = bullet.velocity.length();
        if (currentSpeed < this.maxSpeed) {
            bullet.velocity.normalize().multiply(currentSpeed + this.accelerationRate * deltaTime);
        }
        
        bullet.position.add(Vector2.multiply(bullet.velocity, deltaTime));
        
        // 边界检查
        if (bullet.position.x < -50 || bullet.position.x > 650 ||
            bullet.position.y < -50 || bullet.position.y > 850) {
            bullet.destroy();
        }
    }
    
    draw(bullet, ctx) {
        // 拖尾效果
        const gradient = ctx.createLinearGradient(0, bullet.size, 0, -bullet.size * 2);
        gradient.addColorStop(0, bullet.color);
        gradient.addColorStop(1, 'transparent');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(0, -bullet.size, bullet.size * 0.5, bullet.size * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // 核心
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, bullet.size * 0.7, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * 曲线弹行为
 */
class CurveBehavior extends BulletBehavior {
    constructor() {
        super();
        this.curveRate = 0.05;
    }
    
    update(bullet, deltaTime) {
        bullet.velocity.rotate(this.curveRate * deltaTime * 60);
        bullet.position.add(Vector2.multiply(bullet.velocity, deltaTime));
        
        // 边界检查
        if (bullet.position.x < -50 || bullet.position.x > 650 ||
            bullet.position.y < -50 || bullet.position.y > 850) {
            bullet.destroy();
        }
    }
    
    draw(bullet, ctx) {
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, bullet.size);
        gradient.addColorStop(0, '#fff');
        gradient.addColorStop(0.5, bullet.color);
        gradient.addColorStop(1, bullet._darkenColor(bullet.color, 0.5));
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, bullet.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * 星形弹行为
 */
class StarBehavior extends BulletBehavior {
    constructor() {
        super();
        this.rotationSpeed = 5;
    }
    
    update(bullet, deltaTime) {
        bullet.rotation += this.rotationSpeed * deltaTime * 60;
        bullet.position.add(Vector2.multiply(bullet.velocity, deltaTime));
        
        // 边界检查
        if (bullet.position.x < -50 || bullet.position.x > 650 ||
            bullet.position.y < -50 || bullet.position.y > 850) {
            bullet.destroy();
        }
    }
    
    draw(bullet, ctx) {
        const points = 5;
        const outerRadius = bullet.size;
        const innerRadius = bullet.size * 0.4;
        
        ctx.fillStyle = bullet.color;
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const angle = (i * Math.PI) / points - Math.PI / 2;
            const r = i % 2 === 0 ? outerRadius : innerRadius;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        
        // 中心高光
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, bullet.size * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * 行为工厂
 */
class BulletBehaviorFactory {
    static behaviors = new Map([
        ['normal', NormalBehavior],
        ['laser', LaserBehavior],
        ['homing', HomingBehavior],
        ['bounce', BounceBehavior],
        ['split', SplitBehavior],
        ['accelerate', AccelerateBehavior],
        ['curve', CurveBehavior],
        ['star', StarBehavior]
    ]);
    
    static create(type, bullet) {
        const BehaviorClass = this.behaviors.get(type) || NormalBehavior;
        const behavior = new BehaviorClass();
        
        // 根据bullet的属性初始化行为
        if (bullet.type === 'laser') {
            behavior.extendSpeed = 2000;
        }
        
        return behavior;
    }
    
    static register(type, behaviorClass) {
        this.behaviors.set(type, behaviorClass);
    }
}

// 导出行为类供扩展
export { BulletBehavior, NormalBehavior, LaserBehavior, HomingBehavior, 
         BounceBehavior, SplitBehavior, AccelerateBehavior, CurveBehavior, 
         StarBehavior, BulletBehaviorFactory };