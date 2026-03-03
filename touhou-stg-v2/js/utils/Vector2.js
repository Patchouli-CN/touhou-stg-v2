/**
 * Vector2 - 2D向量类
 * 提供基本的2D向量运算功能
 */
export class Vector2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
    
    /**
     * 设置向量值
     */
    set(x, y) {
        this.x = x;
        this.y = y;
        return this;
    }
    
    /**
     * 复制向量
     */
    clone() {
        return new Vector2(this.x, this.y);
    }
    
    /**
     * 复制另一个向量的值
     */
    copy(v) {
        this.x = v.x;
        this.y = v.y;
        return this;
    }
    
    /**
     * 向量加法
     */
    add(v) {
        this.x += v.x;
        this.y += v.y;
        return this;
    }
    
    /**
     * 向量减法
     */
    subtract(v) {
        this.x -= v.x;
        this.y -= v.y;
        return this;
    }
    
    /**
     * 向量乘法（标量）
     */
    multiply(s) {
        this.x *= s;
        this.y *= s;
        return this;
    }
    
    /**
     * 向量除法（标量）
     */
    divide(s) {
        if (s !== 0) {
            this.x /= s;
            this.y /= s;
        }
        return this;
    }
    
    /**
     * 向量点积
     */
    dot(v) {
        return this.x * v.x + this.y * v.y;
    }
    
    /**
     * 向量叉积（2D中返回标量）
     */
    cross(v) {
        return this.x * v.y - this.y * v.x;
    }
    
    /**
     * 向量长度（模）
     */
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    
    /**
     * 向量长度的平方
     */
    lengthSquared() {
        return this.x * this.x + this.y * this.y;
    }
    
    /**
     * 归一化向量
     */
    normalize() {
        const len = this.length();
        if (len > 0) {
            this.divide(len);
        }
        return this;
    }
    
    /**
     * 获取归一化后的新向量
     */
    normalized() {
        return this.clone().normalize();
    }
    
    /**
     * 向量旋转（弧度）
     */
    rotate(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = this.x * cos - this.y * sin;
        const y = this.x * sin + this.y * cos;
        this.x = x;
        this.y = y;
        return this;
    }
    
    /**
     * 线性插值
     */
    lerp(v, t) {
        this.x += (v.x - this.x) * t;
        this.y += (v.y - this.y) * t;
        return this;
    }
    
    /**
     * 获取向量角度（弧度）
     */
    angle() {
        return Math.atan2(this.y, this.x);
    }
    
    /**
     * 获取到另一个向量的距离
     */
    distanceTo(v) {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    /**
     * 获取到另一个向量的角度
     */
    angleTo(v) {
        return Math.atan2(v.y - this.y, v.x - this.x);
    }
    
    /**
     * 判断向量是否相等
     */
    equals(v, epsilon = 0.0001) {
        return Math.abs(this.x - v.x) < epsilon && Math.abs(this.y - v.y) < epsilon;
    }
    
    /**
     * 将向量限制在最大长度内
     */
    clamp(maxLength) {
        const len = this.length();
        if (len > maxLength) {
            this.normalize().multiply(maxLength);
        }
        return this;
    }
    
    /**
     * 字符串表示
     */
    toString() {
        return `Vector2(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`;
    }
    
    // ============ 静态方法 ============
    
    /**
     * 从角度和长度创建向量
     */
    static fromAngle(angle, length = 1) {
        return new Vector2(
            Math.cos(angle) * length,
            Math.sin(angle) * length
        );
    }
    
    /**
     * 向量加法（返回新向量）
     */
    static add(v1, v2) {
        return new Vector2(v1.x + v2.x, v1.y + v2.y);
    }
    
    /**
     * 向量减法（返回新向量）
     */
    static subtract(v1, v2) {
        return new Vector2(v1.x - v2.x, v1.y - v2.y);
    }
    
    /**
     * 向量乘法（标量，返回新向量）
     */
    static multiply(v, s) {
        return new Vector2(v.x * s, v.y * s);
    }
    
    /**
     * 向量除法（标量，返回新向量）
     */
    static divide(v, s) {
        if (s !== 0) {
            return new Vector2(v.x / s, v.y / s);
        }
        return new Vector2(0, 0);
    }
    
    /**
     * 线性插值（返回新向量）
     */
    static lerp(v1, v2, t) {
        return new Vector2(
            v1.x + (v2.x - v1.x) * t,
            v1.y + (v2.y - v1.y) * t
        );
    }
    
    /**
     * 零向量
     */
    static get ZERO() {
        return new Vector2(0, 0);
    }
    
    /**
     * 单位向量（右）
     */
    static get RIGHT() {
        return new Vector2(1, 0);
    }
    
    /**
     * 单位向量（上）
     */
    static get UP() {
        return new Vector2(0, -1);
    }
}
