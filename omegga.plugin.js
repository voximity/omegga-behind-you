const brs = require("brs-js");
const fs = require("fs");
const util = require("./util");

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
            {first: (match) => match[0].startsWith("Transform:"), timeoutDelay: 1000}
        );
        const result = {x: match[0][1], y: match[0][2], z: match[0][3], roll: match[0][4], pitch: match[0][5], yaw: match[0][6]};
        return Object.fromEntries(Object.entries(result).map(([k, n]) => [k, parseFloat(n.replace(",", ""))]));
    }

    async startTargeting(user) {
        if (this.target != null)
            this.unloadTarget(user);

        const {x, y, z, yaw} = await this.getPlayerTransform(user);
        const rotAxis = util.yawToAxis(yaw);
        const objectDistance = this.config["object-load-distance"];
        const objectTransform = [
            x - rotAxis[0] * objectDistance * 10,
            y - rotAxis[1] * objectDistance * 10,
            z
        ];
        this.target = {
            user: user,
            transform: [x, y, z],
            objectTransform: objectTransform,
            seen: false,
            time: Date.now()
        };

        // load it in
        this.saves[0].loadAt(...objectTransform, util.snapYaw(yaw));
    }

    async unloadTarget() {
        if (this.target == null) return;

        this.omegga.clearBricks(owner.id, true);
        this.target = null;
    }

    async timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async targetLoop() {
        while (true) {
            const players = this.omegga.getPlayers();
            if (players.length == 0) {
                console.log("Not enough players to target.");
                await this.timeout(30 * 1000);
                continue;
            }

            let target;
            if (players.length > 1) {
                do {
                    target = players[Math.floor(Math.random() * players.length)].name;
                } while (target == this.lastPlayer);
                this.lastPlayer = target;
            } else
                target = players[0].name;
            
            console.log(`Attempting to target ${target}...`);

            try {
                await this.startTargeting(target);
                if (this.config.announce) this.omegga.broadcast(`<color="a00">The object is now haunting <b>${target}</>...</>`);
            } catch (e) {
                console.log("Error occurred targeting.");
                console.log(e);
            }

            do {
                await this.timeout(5 * 1000);
            } while (this.target != null);

            await this.timeout(this.config.cooldown * 1000);
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

            save.bounds = OMEGGA_UTIL.brick.getBounds(save.data);

            // move bricks to origin
            save.data.bricks.forEach((brick) => {
                brick.position = [
                    brick.position[0] - save.bounds.center[0],
                    brick.position[1] - save.bounds.center[1],
                    brick.position[2] - save.bounds.center[2]
                ];
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
                const transformDiff = [
                    this.target.objectTransform[0] - currentTransform.x,
                    this.target.objectTransform[1] - currentTransform.y
                ];
                const viewingAngle = util.angleBetween(transformDiff, util.yawToVec(currentTransform.yaw)) * 180 / Math.PI;

                if (Date.now() - this.target.time > this.config["max-object-lifetime"] * 1000) {
                    // it has been some amount of time since started targeting, and it hasn't been seen, so just stop targeting
                    this.unloadTarget();
                    return;
                }

                if (viewingAngle < 60 && !this.target.seen) {
                    // mark object as seen
                    this.time = Date.now();
                    this.target.seen = true;
                    return;
                }

                if (viewingAngle > 90 && this.target.seen) {
                    // unload the object
                    this.unloadTarget();
                    return;
                }

                if (!this.target.seen && util.distance([currentTransform.x, currentTransform.y, currentTransform.z], this.target.objectTransform) > 15 * 10) {
                    // reload the target to the new position
                    const time = this.target.time;
                    await this.startTargeting(this.target.user);
                    this.target.time = time;
                }
            } catch (e) {}
        }, 200);

        await this.timeout(1000);
        this.targetLoop();
    }

    async stop() {
        clearInterval(this.interval);
    }
}