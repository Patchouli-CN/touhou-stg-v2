import { Vector2 } from "../utils/Vector2.js";
import { Particle } from "./Particle.js";
import { Bullet } from "../entities/Bullet.js";
import { logger } from "../utils/Logger.js";

/**
 * Pool - 对象池类（优化版）
 */
export class Pool {
    constructor(createFn, resetFn, initialSize = 10) {
        this._createFn = createFn;
        this._resetFn = resetFn;
        this._pool = [];
        this._active = new Set();
        this._maxSize = 1000;
        
        // 性能统计
        this.stats = {
            created: 0,
            reused: 0,
            released: 0
        };
        
        // 预创建初始对象
        for (let i = 0; i < initialSize; i++) {
            this._pool.push(this._createFn());
            this.stats.created++;
        }
    }
    
    /**
     * 从池中获取一个对象
     */
    acquire(...args) {
        let obj;
        
        if (this._pool.length > 0) {
            obj = this._pool.pop();
            this.stats.reused++;
        } else if (this._active.size < this._maxSize) {
            obj = this._createFn();
            this.stats.created++;
        } else {
            logger.warn('Pool max size reached, returning null');
            return null;
        }
        
        // 重置对象状态
        if (this._resetFn) {
            this._resetFn(obj, ...args);
        }
        
        obj._poolActive = true;
        this._active.add(obj);
        
        return obj;
    }
    
    /**
     * 将对象归还到池中
     */
    release(obj) {
        if (!obj || !obj._poolActive) return false;
        
        obj._poolActive = false;
        this._active.delete(obj);
        
        // 清理对象引用
        if (obj.cleanup) {
            obj.cleanup();
        }
        
        // 如果池未满，归还对象
        if (this._pool.length < this._maxSize) {
            this._pool.push(obj);
            this.stats.released++;
            return true;
        }
        
        return false;
    }
    
    /**
     * 批量归还对象
     */
    releaseAll(objs) {
        for (const obj of objs) {
            this.release(obj);
        }
    }
    
    /**
     * 清空池
     */
    clear() {
        this._pool.length = 0;
        this._active.clear();
        logger.debug('Pool cleared');
    }
    
    /**
     * 获取当前可用对象数量
     */
    get availableCount() {
        return this._pool.length;
    }
    
    /**
     * 获取当前活跃对象数量
     */
    get activeCount() {
        return this._active.size;
    }
    
    /**
     * 获取所有活跃对象
     */
    get activeObjects() {
        return Array.from(this._active);
    }
    
    /**
     * 遍历所有活跃对象
     */
    forEachActive(callback) {
        this._active.forEach(callback);
    }
    
    /**
     * 过滤活跃对象
     */
    filterActive(predicate) {
        const result = [];
        this._active.forEach(obj => {
            if (predicate(obj)) {
                result.push(obj);
            }
        });
        return result;
    }
    
    /**
     * 更新所有活跃对象（优化版）
     */
    updateAll(deltaTime, ...args) {
        const toRelease = [];
        
        this._active.forEach(obj => {
            if (obj.update) {
                obj.update(deltaTime, ...args);
            }
            
            // 如果对象标记为非活跃，准备释放
            if (obj.isActive === false || (obj.shouldRelease && obj.shouldRelease())) {
                toRelease.push(obj);
            }
        });
        
        // 批量释放非活跃对象
        toRelease.forEach(obj => this.release(obj));
        
        return toRelease.length;
    }
    
    /**
     * 渲染所有活跃对象
     */
    renderAll(ctx, ...args) {
        this._active.forEach(obj => {
            if (obj.render) {
                obj.render(ctx, ...args);
            }
        });
    }
    
    /**
     * 获取统计信息
     */
    getStats() {
        return {
            ...this.stats,
            available: this.availableCount,
            active: this.activeCount,
            maxSize: this._maxSize
        };
    }
}

/**
 * BulletPool - 弹幕专用对象池
 */
export class BulletPool extends Pool {
    constructor(maxBullets = 500) {
        super(
            () => new Bullet(),
            (bullet, ...args) => bullet.reset(...args),
            50
        );
        this._maxSize = maxBullets;
    }
    
    /**
     * 发射弹幕
     */
    fire(x, y, velocity, type = 'normal', color = '#fff', size = 4) {
        return this.acquire(x, y, velocity, type, color, size);
    }
    
    /**
     * 清除屏幕上的所有弹幕
     */
    clearAll() {
        const bullets = this.activeObjects;
        bullets.forEach(bullet => {
            bullet.isActive = false;
        });
        return bullets.length;
    }
}

/**
 * ParticlePool - 粒子专用对象池
 */
export class ParticlePool extends Pool {
    constructor(maxParticles = 200) {
        super(
            () => new Particle(),
            (particle, ...args) => particle.reset(...args),
            20
        );
        this._maxSize = maxParticles;
    }
    
    /**
     * 创建爆炸效果
     */
    explode(x, y, color, count = 10) {
        const particles = [];
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
            const speed = 2 + Math.random() * 4;
            const velocity = Vector2.fromAngle(angle, speed);
            const particle = this.acquire(x, y, velocity, color, 0.5 + Math.random() * 0.5);
            if (particle) particles.push(particle);
        }
        return particles;
    }
    
    /**
     * 创建火花效果
     */
    spark(x, y, color, count = 5) {
        const particles = [];
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            const velocity = Vector2.fromAngle(angle, speed);
            const particle = this.acquire(x, y, velocity, color, 0.3 + Math.random() * 0.3);
            if (particle) particles.push(particle);
        }
        return particles;
    }
}
