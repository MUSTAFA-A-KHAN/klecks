export type Point = { x: number; y: number; p?: number };

export class ShapeRecognizer {
    static distance(p1: Point, p2: Point) {
        return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    }

    static distancePointToLine(point: Point, start: Point, end: Point) {
        const num = Math.abs((end.x - start.x) * (start.y - point.y) - (start.x - point.x) * (end.y - start.y));
        const den = this.distance(start, end);
        return den === 0 ? 0 : num / den;
    }

    static boundingCenter(points: Point[]) {
        if (!points || points.length === 0) return { x: 0, y: 0 };
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }

    static getTotalLength(points: Point[]) {
        let length = 0;
        for (let i = 0; i < points.length - 1; i++) {
            length += this.distance(points[i], points[i + 1]);
        }
        return length;
    }

    static recognizeShape(points: Point[]): { type: string, points: Point[], center: Point } | null {
        if (points.length < 5) return null;

        // This reproduces the logic found in the bundle (Line, Circle, Polygon, Rectangle, Square, Polyline)
        const start = points[0];
        const end = points[points.length - 1];

        const closureDist = this.distance(start, end);
        const totalLength = this.getTotalLength(points);
        const isClosed = closureDist < totalLength * 0.1;

        let maxDist = 0;
        for (let i = 1; i < points.length - 1; i++) {
            const dist = this.distancePointToLine(points[i], start, end);
            if (dist > maxDist) maxDist = dist;
        }

        // Line detection
        if (!isClosed && maxDist < totalLength * 0.05) {
            return {
                type: 'line',
                points: [start, end],
                center: this.boundingCenter([start, end])
            };
        }

        // Circle / Polygon detection simplified for recreation
        if (isClosed) {
            // Circle heuristic: distance to center is fairly constant
            const center = this.boundingCenter(points);
            let avgRadius = 0;
            for (const p of points) avgRadius += this.distance(p, center);
            avgRadius /= points.length;

            let isCircle = true;
            for (const p of points) {
                if (Math.abs(this.distance(p, center) - avgRadius) > avgRadius * 0.2) {
                    isCircle = false;
                    break;
                }
            }
            if (isCircle) {
                // Generate perfect circle points
                const circlePoints: Point[] = [];
                const steps = 36;
                for (let i = 0; i <= steps; i++) {
                    const angle = (i / steps) * Math.PI * 2;
                    circlePoints.push({
                        x: center.x + Math.cos(angle) * avgRadius,
                        y: center.y + Math.sin(angle) * avgRadius
                    });
                }
                return { type: 'circle', points: circlePoints, center };
            }
        }

        return {
            type: 'polyline',
            points: points,
            center: this.boundingCenter(points)
        };
    }
}
