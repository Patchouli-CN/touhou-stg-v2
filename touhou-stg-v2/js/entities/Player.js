import { Entity } from "./Entity.js";
import { Vector2 } from "../utils/Vector2.js";
import { logger } from "../utils/Logger.js";

/**
 * Player - 自机（玩家）类（优化版）
 */
export class Player extends Entity {
    constructor(x, y) {
        super(x, y);
        
        // 基本属性
        this.radius = 3;
        this.spriteRadius = 12;
        
        // 移动属性
        this.normalSpeed = 300;
        this.focusSpeed = 150;
        this.currentSpeed = this.normalSpeed;
        
        // 状态
        this.isInvincible = false;
        this.invincibleTime = 0;
        this.isFocused = false;
        this.isShooting = false;
        
        // 无敌模式
        this.godMode = false;
        
        // 生命和炸弹
        this.lives = 3;
        this.bombs = 3;
        this.maxBombs = 8;
        
        // 火力
        this.power = 1.0;
        this.maxPower = 4.0;
        
        // 擦弹
        this.grazeCount = 0;
        this.grazeRadius = 20;
        
        // 射击
        this.shootTimer = 0;
        this.shootInterval = 0.08;
        this.bulletSpeed = 800;
        this.bulletDamage = 10;
        
        // 动画
        this.animationFrame = 0;
        this.animationSpeed = 0.15;
        
        // 颜色
        this.color = '#00ffff';

        this.isBombEnabled = true;
        this.isShootEnabled = true;
        
        // 输入状态
        this.input = {
            up: false,
            down: false,
            left: false,
            right: false,
            shoot: false,
            bomb: false,
            focus: false
        };
        
        // 性能优化：缓存计算结果
        this._cachedBounds = {
            minX: 0,
            maxX: 600,
            minY: 0,
            maxY: 800
        };
    }

    /**
     * 设置是否启用bomb
     */
    setBombEnabled(enable) {
        this.isBombEnabled = enable;
    }

    /**
     * 设置是否启用射击
     */
    setShootEnabled(enable) {
        this.isShootEnabled = enable;
    }
    
    /**
     * 更新玩家
     */
    update(deltaTime, bulletPool, particlePool) {
        super.update(deltaTime);
        
        // 更新无敌时间
        if (this.isInvincible) {
            this.invincibleTime -= deltaTime;
            if (this.invincibleTime <= 0) {
                this.isInvincible = false;
            }
        }
        
        // 处理移动
        this.handleMovement(deltaTime);
        
        // 处理射击
        if (this.isShooting || this.input.shoot) {
            this.handleShooting(deltaTime, bulletPool);
        }
        
        // 处理炸弹
        if (this.input.bomb) {
            const bombUsed = this.useBomb(bulletPool, particlePool);
            if (bombUsed) {
                this.input.bomb = false;
                logger.debug(`Bomb used! Remaining: ${this.bombs}`);
            }
        }
        
        // 更新低速模式
        this.isFocused = this.input.focus;
        this.currentSpeed = this.isFocused ? this.focusSpeed : this.normalSpeed;
    }
    
    /**
     * 处理移动
     */
    handleMovement(deltaTime) {
        let dx = 0;
        let dy = 0;
        
        if (this.input.up) dy -= 1;
        if (this.input.down) dy += 1;
        if (this.input.left) dx -= 1;
        if (this.input.right) dx += 1;
        
        // 对角线移动归一化
        if (dx !== 0 && dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len;
            dy /= len;
        }
        
        // 应用速度
        this.velocity.x = dx * this.currentSpeed;
        this.velocity.y = dy * this.currentSpeed;
        
        // 更新位置
        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;
        
        // 边界限制
        this.position.x = Math.max(this.spriteRadius, Math.min(600 - this.spriteRadius, this.position.x));
        this.position.y = Math.max(this.spriteRadius, Math.min(800 - this.spriteRadius, this.position.y));
    }
    
    /**
     * 处理射击
     */
    handleShooting(deltaTime, bulletPool) {
        if (!this.isShootEnabled) return;

        this.shootTimer += deltaTime;
        
        if (this.shootTimer >= this.shootInterval) {
            this.shootTimer = 0;
            this.fire(bulletPool);
        }
    }
    
    /**
     * 发射子弹
     */
    fire(bulletPool) {
        const bullets = [];
        const powerLevel = Math.floor(this.power);
        
        switch (powerLevel) {
            case 1:
                bullets.push(this.createBullet(bulletPool, 0, 0));
                break;
                
            case 2:
                bullets.push(this.createBullet(bulletPool, -8, 0));
                bullets.push(this.createBullet(bulletPool, 8, 0));
                break;
                
            case 3:
                bullets.push(this.createBullet(bulletPool, 0, 0));
                bullets.push(this.createBullet(bulletPool, -12, 0, -0.1));
                bullets.push(this.createBullet(bulletPool, 12, 0, 0.1));
                break;
                
            case 4:
            default:
                bullets.push(this.createBullet(bulletPool, 0, 0));
                bullets.push(this.createBullet(bulletPool, -12, 0, -0.08));
                bullets.push(this.createBullet(bulletPool, 12, 0, 0.08));
                bullets.push(this.createBullet(bulletPool, -20, -5, -0.15));
                bullets.push(this.createBullet(bulletPool, 20, -5, 0.15));
                break;
        }
        
        return bullets;
    }
    
    /**
     * 创建单个子弹
     */
    createBullet(bulletPool, offsetX, offsetY, angleOffset = 0) {
        const angle = -Math.PI / 2 + angleOffset;
        const velocity = Vector2.fromAngle(angle, this.bulletSpeed);
        
        return bulletPool.acquire(
            this.position.x + offsetX,
            this.position.y + offsetY - 10,
            velocity,
            'normal',
            this.color,
            4,
            'player'
        );
    }
    
    /**
     * 使用炸弹
     */
    useBomb(bulletPool, particlePool) {
        if (this.bombs <= 0 || this.isInvincible || !this.isBombEnabled) return false;
        
        this.bombs--;
        this.isInvincible = true;
        this.invincibleTime = 3;
        
        // 消弹
        if (bulletPool) {
            const clearedCount = bulletPool.clearAll();
            logger.info(`Bomb used! Cleared ${clearedCount} bullets. Bombs left: ${this.bombs}`);
        }
        
        // 创建爆炸效果
        if (particlePool) {
            particlePool.explode(this.position.x, this.position.y, '#ff8800', 30);
        }
        
        return true;
    }
    
    /**
     * 受到伤害
     */
    takeDamage(bulletPool, particlePool) {
        if (this.isInvincible || this.godMode) return false;
        
        this.lives--;
        
        this.isInvincible = true;
        this.invincibleTime = 2;
        
        this.power = Math.max(1, this.power - 0.5);
        
        if (bulletPool) {
            bulletPool.clearAll();
        }
        
        if (particlePool) {
            particlePool.explode(this.position.x, this.position.y, '#ff0000', 20);
        }
        
        logger.info(`Player took damage! Lives: ${this.lives}, Power: ${this.power}`);
        return true;
    }
    
    /**
     * 切换无敌模式
     */
    toggleGodMode() {
        this.godMode = !this.godMode;
        logger.info(`God mode ${this.godMode ? 'enabled' : 'disabled'}`);
        return this.godMode;
    }
    
    /**
     * 增加分数/道具
     */
    collectItem(item) {
        switch (item.type) {
            case 'power':
                this.power = Math.min(this.maxPower, this.power + 0.1);
                return { type: 'power', value: 10 };
                
            case 'point':
                return { type: 'point', value: 100 * (1 + this.power * 0.1) };
                
            case 'bomb':
                this.bombs = Math.min(this.maxBombs, this.bombs + 1);
                return { type: 'bomb', value: 0 };
                
            case 'life':
                this.lives++;
                return { type: 'life', value: 0 };
                
            default:
                return { type: 'none', value: 0 };
        }
    }
    
    /**
     * 擦弹
     */
    graze() {
        this.grazeCount++;
        return 10;
    }
    
    /**
     * 渲染玩家
     */
    draw(ctx) {
        if (!this.isVisible) return;
        
        // 无敌时闪烁
        if (this.isInvincible && Math.floor(this.age * 10) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }
        
        // 绘制低速模式判定圈
        if (this.isFocused) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(0, 0, this.grazeRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        // 无敌模式下显示金色光环
        if (this.godMode) {
            ctx.save();
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            ctx.globalAlpha = 0.8 + Math.sin(this.age * 10) * 0.2;
            ctx.beginPath();
            ctx.arc(0, 0, this.spriteRadius * 1.8, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
            ctx.fill();
            ctx.restore();
            
            ctx.save();
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.shadowColor = '#ff6600';
            ctx.shadowBlur = 5;
            ctx.fillText('GOD', 0, -this.spriteRadius * 2.2);
            ctx.restore();
        }
        
        // 绘制判定点
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // 绘制自机精灵
        this.drawPlayerSprite(ctx);
        
        // 绘制擦弹判定圈
        if (this.isFocused) {
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, this.grazeRadius, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        ctx.globalAlpha = 1;
    }
    
    /**
     * 绘制自机精灵
     */
    drawPlayerSprite(ctx) {
        const floatY = Math.sin(this.age * 5) * 2;
        
        ctx.save();
        ctx.translate(0, floatY);
        
        const mainColor = this.color;
        const darkColor = this._darkenColor(mainColor, 0.6);
        
        // 身体
        ctx.fillStyle = darkColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.spriteRadius * 0.6, this.spriteRadius, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // 头部
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(0, -this.spriteRadius * 0.5, this.spriteRadius * 0.5, 0, Math.PI * 2);
        ctx.fill();
        
        // 蝴蝶结/装饰
        ctx.fillStyle = '#ff69b4';
        ctx.beginPath();
        ctx.moveTo(-this.spriteRadius * 0.8, -this.spriteRadius * 0.3);
        ctx.lineTo(-this.spriteRadius * 0.3, -this.spriteRadius * 0.1);
        ctx.lineTo(-this.spriteRadius * 0.8, 0.1);
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(this.spriteRadius * 0.8, -this.spriteRadius * 0.3);
        ctx.lineTo(this.spriteRadius * 0.3, -this.spriteRadius * 0.1);
        ctx.lineTo(this.spriteRadius * 0.8, 0.1);
        ctx.fill();
        
        // 翅膀/袖子
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.ellipse(-this.spriteRadius * 0.7, 0, this.spriteRadius * 0.4, this.spriteRadius * 0.8, -0.3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.ellipse(this.spriteRadius * 0.7, 0, this.spriteRadius * 0.4, this.spriteRadius * 0.8, 0.3, 0, Math.PI * 2);
        ctx.fill();
        
        // 发光效果
        ctx.shadowColor = mainColor;
        ctx.shadowBlur = 15;
        ctx.fillStyle = mainColor;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, this.spriteRadius * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        
        ctx.restore();
    }
    
    /**
     * 变暗颜色
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
    
    /**
     * 设置输入状态
     */
    setInput(key, value) {
        if (this.input.hasOwnProperty(key)) {
            this.input[key] = value;
        }
    }
    
    /**
     * 是否死亡
     */
    isDead() {
        return this.lives < 0;
    }
    
    /**
     * 重置玩家
     */
    reset(x, y) {
        super.reset(x, y);
        this.lives = 3;
        this.bombs = 3;
        this.power = 1.0;
        this.grazeCount = 0;
        this.isInvincible = false;
        this.invincibleTime = 0;
        this.isFocused = false;
        this.godMode = false;
        this.shootTimer = 0;
        this.input = {
            up: false,
            down: false,
            left: false,
            right: false,
            shoot: false,
            bomb: false,
            focus: false
        };
    }
}
