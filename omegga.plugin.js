//const owner = {
//    name: "x",
//    id: "3f5108a0-c929-4e77-a115-21f65096887b"
//};

const brs = require("brs-js");
const fs = require("fs");

const owner = {
    name: "BehindYou",
    id: "00000000-0000-0000-0000-000000000000"
};

module.exports = class BehindYou {
    constructor(omegga, config, store) {
        this.omegga = omegga;
        this.config = config;
        this.store = store;
    }

    async getPlayerTransform(player) {
        const match = await this.omegga.watchLogChunk(
            `Chat.Command /GetTransform ${player}`,
            /Transform: X=(-?[0-9,.]+) Y=(-?[0-9,.]+) Z=(-?[0-9,.]+) Roll=(-?[0-9,.]+) Pitch=(-?[0-9,.]+) Yaw=(-?[0-9,.]+)/,
            {first: () => true}
        );
        const result = {x: match[0][1], y: match[0][2], z: match[0][3], roll: match[0][4], pitch: match[0][5], yaw: match[0][6]};
        return Object.fromEntries(Object.entries(result).map(([k, n]) => [k, parseFloat(n.replace(",", ""))]));
    }

    // temporary function, remove later
    async loadBrickAt(x, y, z) {
        await this.omegga.loadSaveData({
            brick_owners: [owner],
            brick_assets: ["PB_DefaultBrick"],
            bricks: [
                {size: [5, 5, 6], position: [x, y, z].map(Math.floor), owner_index: 1}
            ]
        }, {quiet: true});
    }

    snapYaw(yaw) {
        return Math.floor((yaw + 225) % 360 / 90);
    }

    yawToAxis(yaw) {
        return [[-1, 0], [0, -1], [1, 0], [0, 1]][this.snapYaw(yaw)];
    }

    magnitude(a) {
        return Math.sqrt(a[0] * a[0] + a[1] * a[1]);
    }

    angleBetween(a, b) {
        return Math.acos((a[0] * b[0] + a[1] * b[1]) / (this.magnitude(a) * this.magnitude(b)));
    }

    yawToVec(a) {
        return [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)];
    }

    distance(a, b) {
        const diffX = a[0] - b[0], diffY = a[1] - b[1], diffZ = a[2] - b[2];
        return Math.sqrt(diffX * diffX + diffY * diffY + diffZ * diffZ);
    }

    async startTargeting(user) {
        if (this.target != null)
            this.unloadTarget(user);
        const {x, y, z, yaw} = await this.getPlayerTransform(user);
        const rotAxis = this.yawToAxis(yaw);
        const objectDistance = this.config["object-load-distance"];
        const objectTransform = [x - rotAxis[0] * objectDistance * 10, y - rotAxis[1] * objectDistance * 10, z];
        this.target = {
            user: user,
            transform: [x, y, z],
            objectTransform: objectTransform,
            seen: false,
            time: Date.now()
        };

        // load it in
        this.saves[0].loadAt(...objectTransform, this.snapYaw(yaw));
    }

    async unloadTarget(dontContinue) {
        if (this.target == null) return;

        this.omegga.clearBricks(owner.id, true);
        this.target = null;

        if (dontContinue) return;
        await this.timeout(1000 * this.config.cooldown);
        await this.startTargetingRandom();
    }

    async timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    randomPlayerNotLast() {
        const players = this.omegga.getPlayers();
        const randomPlayer = players[Math.floor(Math.random() * players.length)];
        if (this.lastPlayer == randomPlayer.name && players.length > 1) return randomPlayerNotLast();
        this.lastPlayer = randomPlayer.name;
        return this.lastPlayer;
    }

    async startTargetingRandom() {
        try {
            const target = this.randomPlayerNotLast();
            console.log(`targeting ${target}`);
            await this.startTargeting(target);
            if (this.config.announce) this.omegga.broadcast(`<color="a00">The object is haunting <b>${target}</>...</>`)
        } catch (e) {
            if (this.omegga.getPlayers().length > 0) {
                console.log(`failed to target, retargeting`);
                await this.startTargetingRandom();
            } else {
                console.log("not enough players to target, waiting for a join");
            }
        }
    }

    async init() {
        this.target = null;

        this.saves = [];

        // add each save. for now, we will just use the one in the config
        this.saves.push({name: this.config["object-save"]});

        this.saves.forEach(async (save) => {
            const file = await fs.promises.readFile(`data/Saved/Builds/${save.name}.brs`)
            save.data = brs.read(file);

            save.data.brick_owners = [owner];

            // calc bounds
            let minX = Number.MAX_VALUE, minY = Number.MAX_VALUE, minZ = Number.MAX_VALUE;
            let maxX = Number.MIN_VALUE, maxY = Number.MIN_VALUE, maxZ = Number.MIN_VALUE;

            save.data.bricks.forEach((brick) => {
                brick.owner_index = 1;

                if (brick.position[0] < minX) minX = brick.position[0];
                if (brick.position[1] < minY) minY = brick.position[1];
                if (brick.position[2] < minZ) minZ = brick.position[2];

                if (brick.position[0] > maxX) maxX = brick.position[0];
                if (brick.position[1] > maxY) maxY = brick.position[1];
                if (brick.position[2] > maxZ) maxZ = brick.position[2];
            });

            // find center
            save.center = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2].map(Math.round);
            
            // move bricks to origin
            save.data.bricks.forEach((brick) => {
                brick.position = [brick.position[0] - save.center[0], brick.position[1] - save.center[1], brick.position[2] - save.center[2]];
            });
            
            save.rotate = (delta) => {
                save.data.bricks = save.data.bricks.map((brick) => OMEGGA_UTIL.brick.rotate_z(delta)(brick));
            }

            save.rotation = 0;

            save.loadAt = (x, y, z, r) => {
                if (r > save.rotation) save.rotate(r - save.rotation);
                else if (r < save.rotation) save.rotate(4 - save.rotation + r);
                save.rotation = r;

                this.omegga.loadSaveData(save.data, {offX: x, offY: y, offZ: z, quiet: true});
            };
        });

        this.interval = setInterval(async () => {
            try {
                if (this.target == null) return;

                const currentTransform = await this.getPlayerTransform(this.target.user);
                const transformDiff = [this.target.objectTransform[0] - currentTransform.x, this.target.objectTransform[1] - currentTransform.y];
                const viewingAngle = this.angleBetween(transformDiff, this.yawToVec(currentTransform.yaw)) * 180 / Math.PI;

                if (Date.now() - this.target.time > this.config["max-object-lifetime"] * 1000) {
                    // it has been some amount of time since started targeting, and it hasn't been seen, so just stop targeting
                    this.unloadTarget();
                    return;
                }

                if (viewingAngle < 60 && !this.target.seen) {
                    // mark object as seen
                    this.target.seen = true;
                    return;
                }

                if (viewingAngle > 90 && this.target.seen) {
                    // unload the object
                    this.unloadTarget();
                    return;
                }

                if (!this.target.seen && this.distance([currentTransform.x, currentTransform.y, currentTransform.z], this.target.objectTransform) > 15 * 10) {
                    // reload the target to the new position
                    const time = this.target.time;
                    await this.startTargeting(this.target.user);
                    this.target.time = time;
                }
            } catch (e) {}
        }, 200);

        this.omegga.on("join", async () => {
            await this.timeout(5000);
            await this.startTargetingRandom();
        });

        try {
            await this.timeout(1000);
            await this.startTargetingRandom();
        } catch (e) { console.log(e); }
    }

    async stop() {
        clearInterval(this.interval);
    }
}