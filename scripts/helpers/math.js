// write math functions witout the need to import math.js

const PI = 3.141592653589793;

export const isMath = {
    toRadians: (degrees) => (degrees * PI) / 180,
    toDegrees: (radians) => (radians * 180) / PI,
    normalizeRadians: (radians) => {
        let pi2 = 2 * PI;
        while (radians < -PI) radians += pi2;
        while (radians > PI) radians -= pi2;
        return radians;
    },
    sin: (radians) => Math.sin(radians),
    cos: (radians) => Math.cos(radians),
    round: (value) => Math.round(value),
    PI: PI,
};
