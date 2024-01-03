const TestCore = require("./test_core");
const capture = require('./program_capture');
const blacklist = require("./blacklist");

const SPEEDS_MS = [
    2000,
    1000,
    500,
    250,
    100
];

module.exports = class {

    #dead = false;

    #interval;
    #socket;
    #testCore;
    #testCoreSpeed;

    #lastFrameTime = false;
    #trainingCoreBuff = false;
    #trainingCoreFlagsBuff = false;
    #handles = [];
    #receivedInitialGlobalTick = false;
    #globalCoreID = 0;

    constructor(socket) {

        this.#globalCoreID = WORLD.getCoreIdForClient(socket.id);

        this.#handles.push(this.globalCore.onTicked(this.#onGlobalTick.bind(this)));
        this.#handles.push(this.globalCore.onScoreChanged(this.#onScoreChanged.bind(this)));

        socket.on("stopTestingProgram", (function () {
            this.#testCore = false;
            clearInterval(this.#interval);
        }).bind(this));

        socket.on("setSpeed", (function (speedInt) {
            this.#testCoreSpeed = speedInt;
            log.debug(`Core speed for socket ${socket.id} is now ${this.#testCoreSpeed}`);
        }).bind(this));

        socket.on("testProgram", (function (programName, programString, speed) {
            this.#testCore = false;
            clearInterval(this.#interval);

            const core = new TestCore(programName, programString);
            if (core.state == core.EState.INVALID) {
                socket.emit("invalidProgram", programName, core.haltReason);
                capture.captureNonFunctional(socket.id, programName, programString, core.haltReason);
            }
            else {
                capture.captureFunctional(socket.id, programName, programString, core.compiledProgram);
                this.#testCore = core;
                this.#lastFrameTime = Date.now();
                this.#sendTestCore();
                this.#interval = setInterval(this.#frame.bind(this), SPEEDS_MS[SPEEDS_MS.length - 1]); // Tick as fast as we may
                this.#testCoreSpeed = speed;
            }
        }).bind(this));

        socket.on("reconnect_failed", (function () {
            log.info(`Killing client ${socket.id}, reconnect failed`);
            this.#destroy();
        }).bind(this));

        socket.on("error", (function () {
            log.info(`Killing client ${socket.id}, connection error`);
            this.#destroy();
        }).bind(this));

        socket.on("disconnect", (function () {
            log.info(`Killing client ${socket.id}, graceful disconnect`);
            this.#destroy();
        }).bind(this));

        socket.on("uploadProgram", (function (programName, programString) {
            this.#testCore = false;
            clearInterval(this.#interval);

            if (programName.length < 1) {
                programName = "UNKNOWN.ELF";
            }

            programName = programName.substring(0, Math.min(programName.length, CONFIG.MAX_PROGRAM_NAME_LENGTH));

            log.info(`Client ${socket.id} uploading program named "${programName}" (${programString.length} characters)`);

            const [id, msg] = this.globalCore.installProgram(programName, programString, socket.handshake.address);
            const success = id !== false;

            log.info(`Installation of program "${programName}" returned ${success}`);

            if (success) {
                capture.captureFunctional(socket.id, programName, programString, this.globalCore.getProgramInstructions(id));

                this.#onScoreChanged(this.globalCore.scores);
                socket.emit("programUploaded");
            }
            else {
                socket.emit("invalidProgram", programName, msg);

                if (blacklist.isBannedAddress(socket.handshake.address))
                {
                    log.info(`Kicking client ${socket.id} off connection (got banned)`);
                    this.#destroy();
                    socket.disconnect(true);
                }
            }
        }).bind(this));

        log.info(`Born client ${socket.id} on address ${socket.handshake.address}`);
        this.#socket = socket;
    }

    get dead() { return this.#dead; }

    get globalCore() { return WORLD.getCore(this.#globalCoreID); }

    #frame() {
        if (this.#testCore && this.#testCore.state != this.#testCore.EState.INVALID) {

            const frameLengthMs = SPEEDS_MS[Math.min(Math.max(0, this.#testCoreSpeed), SPEEDS_MS.length - 1)];
            const now = Date.now();
            if (this.#lastFrameTime == false || (now - this.#lastFrameTime) > frameLengthMs) {
                if (this.#testCore.state == this.#testCore.EState.HALTED) {
                    // Core crashed
                    this.#testCore = null;
                }
                else {
                    this.#testCore.advance();
                    this.#sendTestCore();
                }

                this.#lastFrameTime = now;
            }
        }
    }

    #sendTestCore() {
        let delta = null, deltaFlags = null;

        if (!this.#trainingCoreBuff) {
            this.#trainingCoreBuff = this.#testCore.dumpCore();
        }
        else {
            delta = this.#testCore.dumpCoreToBuffer(this.#trainingCoreBuff);
        }

        if (!this.#trainingCoreFlagsBuff) {
            this.#trainingCoreFlagsBuff = this.#testCore.dumpFlags();
        }
        else {
            deltaFlags = this.#testCore.dumpFlagsToBuffer(this.#trainingCoreFlagsBuff);
        }

        const obj = {
            columnCount: this.#testCore.columnCount,
            columnSize: this.#testCore.columnSize,
            data: delta == null ? this.#trainingCoreBuff : null,
            flags: deltaFlags == null ? this.#trainingCoreFlagsBuff : null,
            delta: delta,
            deltaFlags, deltaFlags,
            nextAddress: this.#testCore.nextAddressToExecute
        };

        if (this.#testCore.state == this.#testCore.EState.HALTED) {
            obj.error = this.#testCore.haltReason;
        }

        this.#socket.emit("testCore", obj);
    }

    #destroy() {
        for (const k in this.#handles) {
            this.#handles[k]();
        }

        clearInterval(this.#interval); // Kill client
        this.#dead = true;
    }

    #onGlobalTick(delta) {
        const gc =this.globalCore;
        if (this.#receivedInitialGlobalTick) {
            this.#socket.emit("deltaCore", delta, gc.scores, gc.activePointers);
        }
        else {

            this.#receivedInitialGlobalTick = true;
            this.#socket.emit("initialCore", {
                scores: gc.scores,
                data: gc.serializedBuffer,
                columnCount: gc.columnCount,
                columnSize: gc.columnSize,
                activity: gc.activePointers,
                coreInfo: {
                    id: gc.id,
                    friendlyName: gc.friendlyName,
                    availableCores: WORLD.getAvailableCores(),
                }
            });
        }
    }

    #onScoreChanged(scores) {
        this.#socket.emit("updateScoreboard", scores, this.globalCore.activePointers);
    }
}