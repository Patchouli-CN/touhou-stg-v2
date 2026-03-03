import { Vector2 } from "../utils/Vector2.js";
import { logger } from "../utils/Logger.js";

/**
 * Particle - 粒子类（优化版）
 */
export class Particle {
    constructor() {
        this.position = new Vector2();
        this.velocity = new Vector2();
        this.color = '#fff';
        this.size = 2;
        this.life = 1;
        this.decay = 0.02;
        this.isActive = false;
        this._poolActive = false;
        
        // 可选属性
        this.alpha = 1;
        this.scale = 1;
        this.rotation = 0;
        this.rotationSpeed = 0;
        this.gravity = 0;
        this.friction = 1;
    }
    
    /**
     * 重置粒子（用于对象池）
     */
    reset(x, y, velocity, color = '#fff', life = 1, size = 2) {
        this.position.set(x, y);
        this.velocity = velocity.clone ? velocity.clone() : new Vector2(velocity.x || 0, velocity.y || 0);
        this.color = color;
        this.size = size;
        this.life = life;
        this.decay = 0.01 + Math.random() * 0.02;
        this.isActive = true;
        this.alpha = 1;
        this.scale = 1;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.2;
        this.gravity = 0.05;
        this.friction = 0.98;
        
        return this;
    }
    
    /**
     * 更新粒子
     */
    update(deltaTime) {
        if (!this.isActive) return;
        
        // 应用重力
        this.velocity.y += this.gravity;
        
        // 应用摩擦力
        this.velocity.multiply(this.friction);
        
        // 更新位置
        this.position.add(Vector2.multiply(this.velocity, deltaTime * 60));
        
        // 更新旋转
        this.rotation += this.rotationSpeed;
        
        // 衰减生命值
        this.life -= this.decay * deltaTime * 60;
        this.alpha = Math.max(0, this.life);
        this.scale = this.life;
        
        // 生命值耗尽则失效
        if (this.life <= 0) {
            this.isActive = false;
        }
    }
    
    /**
     * 渲染粒子
     */
    render(ctx) {
        if (!this.isActive || this.alpha <= 0) return;
        
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.rotation);
        ctx.scale(this.scale, this.scale);
        
        // 绘制粒子
        ctx.fillStyle = this.color;
        ctx.beginPath();
        
        // 根据大小选择形状
        if (this.size < 3) {
            ctx.arc(0, 0, this.size, 0, Math.PI * 2);
        } else {
            this.renderStar(ctx, 0, 0, this.size, 4);
        }
        
        ctx.fill();
        
        // 添加发光效果
        if (this.size > 2) {
            ctx.shadowColor = this.color;
            ctx.shadowBlur = this.size * 2;
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    /**
     * 绘制星形
     */
    renderStar(ctx, x, y, radius, points) {
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const angle = (i * Math.PI) / points - Math.PI / 2;
            const r = i % 2 === 0 ? radius : radius * 0.5;
            const px = x + Math.cos(angle) * r;
            const py = y + Math.sin(angle) * r;
            if (i === 0) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
    }
    
    /**
     * 清理引用（用于对象池）
     */
    cleanup() {
        this.velocity = null;
    }
    
    /**
     * 是否应该释放回对象池
     */
    shouldRelease() {
        return !this.isActive || this.life <= 0;
    }
}

/**
 * FloatingText - 浮动文字效果
 */
export class FloatingText {
    constructor() {
        this.position = new Vector2();
        this.text = '';
        this.color = '#fff';
        this.size = 16;
        this.life = 1;
        this.maxLife = 1;
        this.velocity = new Vector2(0, -1);
        this.isActive = false;
        this._poolActive = false;
    }
    
    reset(x, y, text, color = '#fff', size = 16, life = 1) {
        this.position.set(x, y);
        this.text = text;
        this.color = color;
        this.size = size;
        this.life = life;
        this.maxLife = life;
        this.velocity.set(0, -30);
        this.isActive = true;
        return this;
    }
    
    update(deltaTime) {
        if (!this.isActive) return;
        
        this.position.add(Vector2.multiply(this.velocity, deltaTime));
        this.life -= deltaTime;
        
        if (this.life <= 0) {
            this.isActive = false;
        }
    }
    
    render(ctx) {
        if (!this.isActive) return;
        
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.font = `bold ${this.size}px 'Noto Sans SC', sans-serif`;
        ctx.textAlign = 'center';
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fillText(this.text, this.position.x, this.position.y);
        ctx.restore();
    }
    
    shouldRelease() {
        return !this.isActive || this.life <= 0;
    }
}
