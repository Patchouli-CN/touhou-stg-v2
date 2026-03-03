import { Vector2 } from "../utils/Vector2.js";

/**
 * Entity - 游戏实体基类
 * 所有游戏对象（玩家、敌人、道具等）的基类
 */
export class Entity {
    constructor(x = 0, y = 0) {
        this.position = new Vector2(x, y);
        this.velocity = new Vector2();
        this.acceleration = new Vector2();
        
        // 基本属性
        this.radius = 10;           // 碰撞半径
        this.isActive = true;       // 是否活跃
        this.isVisible = true;      // 是否可见
        this.zIndex = 0;            // 渲染层级
        
        // 动画
        this.animationFrame = 0;
        this.animationTimer = 0;
        this.animationSpeed = 0.1;
        
        // 生命周期
        this.age = 0;               // 存在时间（秒）
        this.lifeTime = -1;         // 最大生命时间（-1为无限）
        
        // 对象池标记
        this._poolActive = false;
    }
    
    /**
     * 重置实体（用于对象池）
     */
    reset(x, y) {
        this.position.set(x, y);
        this.velocity.set(0, 0);
        this.acceleration.set(0, 0);
        this.isActive = true;
        this.isVisible = true;
        this.age = 0;
        this.animationFrame = 0;
        this.animationTimer = 0;
        return this;
    }
    
    /**
     * 更新实体
     */
    update(deltaTime) {
        if (!this.isActive) return;
        
        // 更新年龄
        this.age += deltaTime;
        
        // 检查生命周期
        if (this.lifeTime > 0 && this.age >= this.lifeTime) {
            this.destroy();
            return;
        }
        
        // 应用加速度
        this.velocity.add(Vector2.multiply(this.acceleration, deltaTime));
        
        // 应用速度
        this.position.add(Vector2.multiply(this.velocity, deltaTime));
        
        // 更新动画
        this.updateAnimation(deltaTime);
        
        // 边界检查
        this.checkBounds();
    }
    
    /**
     * 更新动画
     */
    updateAnimation(deltaTime) {
        this.animationTimer += deltaTime;
        if (this.animationTimer >= this.animationSpeed) {
            this.animationTimer = 0;
            this.animationFrame++;
        }
    }
    
    /**
     * 边界检查（子类可重写）
     */
    checkBounds() {
        // 默认不处理，子类根据需要重写
    }
    
    /**
     * 渲染实体
     */
    render(ctx) {
        if (!this.isActive || !this.isVisible) return;
        
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        
        this.draw(ctx);
        
        ctx.restore();
    }
    
    /**
     * 绘制实体（子类必须重写）
     */
    draw(ctx) {
        // 基类绘制一个简单圆形作为占位
        ctx.fillStyle = '#888';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    
    /**
     * 移动到一定位置
     */
    moveTo(x, y, speed = null) {
        const target = new Vector2(x, y);
        const direction = Vector2.subtract(target, this.position);
        
        if (speed !== null) {
            direction.normalize().multiply(speed);
        }
        
        this.velocity = direction;
    }
    
    /**
     * 平滑移动到一定位置
     */
    moveToSmooth(x, y, factor = 0.1) {
        const target = new Vector2(x, y);
        const diff = Vector2.subtract(target, this.position);
        this.velocity = Vector2.multiply(diff, factor);
    }
    
    /**
     * 获取与另一个实体的距离
     */
    distanceTo(other) {
        return this.position.distanceTo(other.position);
    }
    
    /**
     * 获取朝向另一个实体的角度
     */
    angleTo(other) {
        return this.position.angleTo(other.position);
    }
    
    /**
     * 检测与另一个实体的碰撞
     */
    collidesWith(other) {
        const distance = this.distanceTo(other);
        return distance < (this.radius + other.radius);
    }
    
    /**
     * 受到伤害
     */
    takeDamage(amount) {
        // 子类重写
    }
    
    /**
     * 销毁实体
     */
    destroy() {
        this.isActive = false;
    }
    
    /**
     * 清理引用（用于对象池）
     */
    cleanup() {
        // 子类重写以清理引用
    }
    
    /**
     * 是否应该释放回对象池
     */
    shouldRelease() {
        return !this.isActive;
    }
}

/**
 * Item - 道具基类
 */
export class Item extends Entity {
    constructor(x, y, type = 'power') {
        super(x, y);
        this.type = type;
        this.radius = 8;
        this.velocity = new Vector2(0, -50);  // 初始向上弹出
        this.attractRange = 100;   // 吸引范围
        this.attractSpeed = 200;   // 吸引速度
        this.value = 10;
        
        // 设置颜色
        this.colors = {
            power: '#ff8800',
            point: '#0088ff',
            bomb: '#00ff00',
            life: '#ff0000',
            star: '#ffff00'
        };
    }
    
    update(deltaTime, player = null) {
        super.update(deltaTime);
        
        // 重力效果
        this.velocity.y += 100 * deltaTime;
        
        // 最大下落速度
        if (this.velocity.y > 150) {
            this.velocity.y = 150;
        }
        
        // 玩家吸引
        if (player && player.isActive) {
            const distance = this.distanceTo(player);
            
            // 全屏吸引（玩家按住Shift或道具在屏幕上方）
            const autoCollect = this.position.y < 100 || 
                               (player.isShiftHeld && distance < 200);
            
            if (autoCollect || distance < this.attractRange) {
                const angle = this.angleTo(player);
                const attractVel = Vector2.fromAngle(angle, this.attractSpeed);
                this.velocity.lerp(attractVel, 0.2);
            }
        }
        
        // 边界检查（超出屏幕底部销毁）
        if (this.position.y > 900) {
            this.destroy();
        }
    }
    
    draw(ctx) {
        const color = this.colors[this.type] || '#fff';
        
        // 绘制道具
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        
        // 根据类型绘制不同形状
        switch (this.type) {
            case 'power':
                // P点 - 圆形
                ctx.beginPath();
                ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
                ctx.fill();
                // P字样
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('P', 0, 0);
                break;
                
            case 'point':
                // 蓝点 - 菱形
                ctx.beginPath();
                ctx.moveTo(0, -this.radius);
                ctx.lineTo(this.radius, 0);
                ctx.lineTo(0, this.radius);
                ctx.lineTo(-this.radius, 0);
                ctx.closePath();
                ctx.fill();
                break;
                
            case 'bomb':
                // B点 - 星形
                this.drawStar(ctx, 0, 0, this.radius, 5);
                ctx.fill();
                break;
                
            case 'life':
                // 残机 - 心形
                this.drawHeart(ctx, 0, 0, this.radius);
                ctx.fill();
                break;
                
            default:
                ctx.beginPath();
                ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
                ctx.fill();
        }
        
        ctx.shadowBlur = 0;
    }
    
    drawStar(ctx, x, y, radius, points) {
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
    
    drawHeart(ctx, x, y, size) {
        ctx.beginPath();
        ctx.moveTo(x, y + size * 0.3);
        ctx.bezierCurveTo(
            x - size * 0.5, y - size * 0.3,
            x - size, y + size * 0.3,
            x, y + size
        );
        ctx.bezierCurveTo(
            x + size, y + size * 0.3,
            x + size * 0.5, y - size * 0.3,
            x, y + size * 0.3
        );
        ctx.closePath();
    }
    
    /**
     * 收集道具
     */
    collect(player) {
        this.destroy();
        return { type: this.type, value: this.value };
    }
}
