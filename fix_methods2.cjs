const fs = require('fs');
const filepath = './src/app/script/klecks/brushes/TelegramBrush.ts';
let code = fs.readFileSync(filepath, 'utf8');

// I need to add the missing methods renderSpray, renderWatercolor, renderComplexTexturedStroke
// that were reported missing by the reviewer.

const missingMethods = `
    private renderSpray() {
        if (!this.context || !this.lastP) return;
        const currentP = this.points[this.points.length - 1];

        const softness = this.config.softness || 0.3;
        const density = this.size * 2;
        const radius = this.size * (this.config.pressureOn ? currentP.p : 1);

        this.context.fillStyle = this.color;
        this.context.globalAlpha = this.opacity * softness;

        for (let i = 0; i < density; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * radius;
            const px = currentP.x + Math.cos(angle) * dist;
            const py = currentP.y + Math.sin(angle) * dist;
            this.context.beginPath();
            this.context.arc(px, py, 1, 0, Math.PI * 2);
            this.context.fill();
        }
    }

    private renderWatercolor() {
        if (!this.context || !this.lastP) return;
        const currentP = this.points[this.points.length - 1];

        const r = this.size * (this.config.pressureOn ? currentP.p : 1);

        this.context.globalAlpha = this.opacity * 0.7; // watercolor base opacity
        this.context.fillStyle = this.color;
        this.context.beginPath();
        this.context.arc(currentP.x, currentP.y, r, 0, Math.PI * 2);
        this.context.fill();

        // draw texture if available
        if (this.textureImg && this.config.textureOn) {
            this.context.globalCompositeOperation = 'multiply';
            this.context.globalAlpha = 0.5;
            this.context.drawImage(this.textureImg, currentP.x - r, currentP.y - r, r * 2, r * 2);
            this.context.globalCompositeOperation = 'source-over';
        }

        if (this.config.outline) {
            this.context.lineWidth = this.config.outlineSize || 2;
            this.context.strokeStyle = this.color;
            this.context.globalAlpha = this.config.outlineOpacity || 0.7;
            this.context.stroke();
        }
    }

    private renderComplexTexturedStroke(x: number, y: number, p: number) {
        if (!this.context || !this.lastP) return;

        let currentSize = this.size;
        if (this.config.pressureOn && this.config.pressureAvailable) {
            currentSize *= p;
        }

        this.context.lineWidth = currentSize;
        this.context.lineCap = 'round';
        this.context.lineJoin = 'round';
        this.context.strokeStyle = this.color;
        this.context.globalAlpha = this.opacity;

        // Apply neon glow
        if (this.config.name === 'neon') {
            this.context.shadowBlur = this.config.neonSize || 25;
            this.context.shadowColor = this.color;
        } else {
            this.context.shadowBlur = 0;
            if (this.config.shadowStrength) {
                this.context.shadowBlur = this.config.shadowStrength * 10;
                this.context.shadowColor = this.config.shadowColor || 'black';
            }
        }

        // Texture overlay (pencil, oil, texture)
        if (this.textureImg && this.config.textureOn) {
            const pat = this.context.createPattern(this.textureImg, 'repeat');
            if (pat) this.context.strokeStyle = pat;
        }

        // Wobble logic for bristle, wet, flat
        let targetX = x;
        let targetY = y;
        if (this.config.wobble) {
            targetX += (Math.random() - 0.5) * this.config.wobble * this.size;
            targetY += (Math.random() - 0.5) * this.config.wobble * this.size;
        }

        this.context.beginPath();
        this.context.moveTo(this.lastP.x, this.lastP.y);
        this.context.lineTo(targetX, targetY);
        this.context.stroke();

        this.context.shadowBlur = 0; // reset
    }
`;

code = code.replace(/\}$/, missingMethods + '\n}');

fs.writeFileSync(filepath, code);
