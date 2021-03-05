function snapYaw(yaw) {
    return Math.floor((yaw + 225) % 360 / 90);
}

function yawToAxis(yaw) {
    return [[-1, 0], [0, -1], [1, 0], [0, 1]][snapYaw(yaw)];
}

function magnitude(a) {
    return Math.sqrt(a.map(n => n * n).reduce((a, c) => a + c));
}

function dot(a, b) {
    return a.map((n, i) => n * b[i]).reduce((acc, c) => acc + c);
}

function angleBetween(a, b) {
    return Math.acos(dot(a, b) / (magnitude(a) * magnitude(b)));
}

function yawToVec(a) {
    return [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)];
}

function distance(a, b) {
    return Math.sqrt(a.map((n, i) => n - b[i]).map((n) => n * n).reduce((acc, c) => acc + c));
}

module.exports = {
    snapYaw,
    yawToAxis,
    magnitude,
    dot,
    angleBetween,
    yawToVec,
    distance
};