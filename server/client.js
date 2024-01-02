const TestCore = require("./test_core");

const MAX_PROGRAM_NAME_LENGTH = 32;

const SPEEDS_MS = [
    2000,
    1000,
    500,
    250,
    100
];

module.exports = class {


    #interval;
    #socket;
    #testCore;
    #testCoreSpeed;

    #lastFrameTime = false;
    #trainingCoreBuff = false;
    #trainingCoreFlagsBuff = false;
    #handles = [];
    #receivedInitialGlobalTick = false;

    constructor(socket) {

        this.#handles.push(global.GLOBAL_CORE.onTicked(this.#onGlobalTick.bind(this)));
        this.#handles.push(global.GLOBAL_CORE.onScoreChanged(this.#onScoreChanged.bind(this)));

        socket.on("stopTestingProgram", (function () {
            this.#testCore = false;
            clearInterval(this.#interval);
        }).bind(this));

        socket.on("setSpeed", (function (speedInt) {
            this.#testCoreSpeed = speedInt;
            console.log("Core speed is now %d", this.#testCoreSpeed);
        }).bind(this));

        socket.on("testProgram", (function (programName, programString, speed) {
            this.#testCore = false;
            clearInterval(this.#interval);

            const core = new TestCore(programName, programString);
            if (core.state == core.EState.INVALID) {
                socket.emit("invalidProgram", programName);
            }
            else {
                this.#testCore = core;
                this.#lastFrameTime = Date.now();
                this.#sendTestCore();
                this.#interval = setInterval(this.#frame.bind(this), SPEEDS_MS[SPEEDS_MS.length - 1]); // Tick as fast as we may
                this.#testCoreSpeed = speed;
            }
        }).bind(this));

        socket.on("reconnect_failed", (function () {
            console.log("Killing client, reconnect failed");
            this.#destroy();
        }).bind(this));

        socket.on("error", (function () {
            console.log("Killing client, connection error");
            this.#destroy();
        }).bind(this));

        socket.on("disconnect", (function () {
            console.log("Killing client, disconnect");
            this.#destroy();
        }).bind(this));

        socket.on("uploadProgram", (function (programName, programString) {
            this.#testCore = false;
            clearInterval(this.#interval);

            if (programName.length < 1)
            {
                programName = "UNKNOWN.ELF";
            }

            programName = programName.substring(0, Math.min(programName.length, MAX_PROGRAM_NAME_LENGTH));

            const success = global.GLOBAL_CORE.installProgram(programName, programString);
            console.log(`Received ${programName}, installation returned ${success}`);
            if (success) {
                this.#onScoreChanged(global.GLOBAL_CORE.scores);
                socket.emit("programUploaded");
            }
            else {
                socket.emit("invalidProgram", programName);
            }
        }).bind(this));

        this.#socket = socket;
    }

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
    }

    #onGlobalTick(delta) {
        if (this.#receivedInitialGlobalTick) {
            this.#socket.emit("deltaCore", delta, global.GLOBAL_CORE.activePointers);
        }
        else {

            this.#receivedInitialGlobalTick = true;
            this.#socket.emit("initialCore", {
                scores: global.GLOBAL_CORE.scores,
                data: global.GLOBAL_CORE.serializedBuffer,
                columnCount: global.GLOBAL_CORE.columnCount,
                columnSize: global.GLOBAL_CORE.columnSize,
                activity: global.GLOBAL_CORE.activePointers
            });
        }
    }

    #onScoreChanged(scores) {
        this.#socket.emit("updateScoreboard", scores, global.GLOBAL_CORE.activePointers);
    }
}