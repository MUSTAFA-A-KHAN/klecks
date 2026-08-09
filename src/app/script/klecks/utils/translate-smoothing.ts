/**
 * from stabilizer dropdown value to line-smoothing value
 * @param s
 */
export function translateSmoothing(s: number): number {
    // Smoother scaling curve for new line smoothing logic (0 to 1)
    if (s == 1) {
        return 0; // Off
    }
    if (s == 2) {
        return 0.3; // Light
    }
    if (s == 3) {
        return 0.6; // Medium
    }
    if (s == 4) {
        return 0.8; // High
    }
    if (s == 5) {
        return 0.92; // Very High
    }
    return s;
}
