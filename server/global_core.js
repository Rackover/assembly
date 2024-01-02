const parser = require('./parser');
const compiler = require('./compiler');
const { Rules } = require('./rules');
const { Core } = require('./core');

const MAX_PROGRAMS = 31;
const CORE_SPEED = 300;

class LocalProgram {
    instructions;
    id;
    name;
}

module.exports = class {

    #programs = [];
    #core;
    #availableProgramIDs = [];
    #interval;
    #tick = 0;
    #serializedBuffer;
    #scores = [];

    get columnSize() {
        return this.#core.columnSize;
    }

    get columnCount() {
        return this.#core.columnCount;
    }

    get scores() {
        return this.#scores;
    }

    get tick() {
        return this.#tick;
    }

    get serializedBuffer() {
        return this.#serializedBuffer;
    }

    get activePointers() {
        const active = {};
        const nextToPlay = this.#core.getProgramPointers(this.#core.nextProgramToPlay);
        for (let i = 0; i < this.#core.programCount; i++) {
            const ptrs = this.#core.getProgramPointers(i);
            active[ptrs.programId] = {
                address: ptrs.nextAddressToExecute,
                executesNext: nextToPlay === ptrs
            };
        }

        return active;
    }

    // Events
    #tickEventListeners = {};
    #tickEventListenersId = 0;
    onTicked(lambda) {
        const id = this.#tickEventListenersId++;
        this.#tickEventListeners[id] = lambda;
        return function () {
            this.#tickEventListeners[id] = false;
        }.bind(this);
    }

    #broadcastOnTicked(delta) {
        for (const k in this.#tickEventListeners) {
            if (this.#tickEventListeners[k]) {
                this.#tickEventListeners[k](delta);
            }
        }
    }

    #scoreEventListeners = {};
    #scoreEventListenersId = 0;
    onScoreChanged(lambda) {
        const id = this.#scoreEventListenersId++;
        this.#scoreEventListeners[id] = lambda;
        return function () {
            this.#scoreEventListeners[id] = false;
        }.bind(this);
    }

    #broadcastOnScoreChanged(scores) {
        for (const k in this.#scoreEventListeners) {
            if (this.#scoreEventListeners[k]) {
                this.#scoreEventListeners[k](scores);
            }
        }
    }
    // End of

    constructor() {
        const rules = new Rules();
        rules.runForever = true;
        rules.columnCount = 5;
        rules.columnSize = 256;

        const core = new Core(rules);
        core.onProgramKilled(this.#onProgramKilled.bind(this));

        this.#serializedBuffer = Buffer.alloc(core.maxAddress * 2);

        this.#core = core;

        for (let i = 0; i < MAX_PROGRAMS; i++) {
            this.#availableProgramIDs.push(i + 1);
        }

        this.#interval = setInterval(this.advance.bind(this), CORE_SPEED / MAX_PROGRAMS);
    }

    kill() {
        clearInterval(this.#interval);
    }

    installProgram(name, code) {
        const id = this.#grabProgramId();

        if (id === false) {
            return false;
        }

        const tokens = parser.tokenize(code);

        if (tokens.anyError) {
            return false;
        }
        else {
            const compiled = compiler.compile(tokens.tokens);

            const program = new LocalProgram();
            program.name = name;
            program.id = id;
            program.instructions = compiled;

            let position = Math.floor(this.#core.maxAddress / 2);

            // Find free position in core
            if (this.#core.programCount > 0) {
                const existingPointers = this.#getOccupiedAddresses();

                const emptySegments = [];

                // Find empty segments
                {
                    let ongoingSegmentStart = 0;
                    let ongoingSegmentLength = 0;
                    for (let i = 0; i < this.#core.maxAddress; i++) {
                        if (existingPointers[i] === true) {
                            emptySegments.push({ start: ongoingSegmentStart, length: ongoingSegmentLength });
                            ongoingSegmentStart = i + 1;
                            ongoingSegmentLength = 0;
                        }
                        else {
                            ongoingSegmentLength++;
                        }
                    }

                    if (ongoingSegmentLength) {
                        emptySegments.push({ start: ongoingSegmentStart, length: ongoingSegmentLength });
                    }
                }

                // Last segment is also first segment, but this fact is ignored here
                // It's okay and it's better like this: installing program between 
                //  the end and start of the core will look weird

                // Longest segment first
                emptySegments.sort(function(a, b) { return a.length < b.length ? 1 : -1});

                // debug
                for (const k in emptySegments) {
                    console.log(`[${k}] : [${JSON.stringify(emptySegments[k])}]`);
                }
                // 

                position = emptySegments[0].start + Math.floor(emptySegments[0].length / 2);
            }

            console.log(`Global core: installing program ${program.name}:${program.id} at position ${position}`);
            this.#core.installProgram(program, position);
            this.#programs.push(program);
            this.#scores.push({
                id: id,
                name: program.name,
                kills: 0
            });

            return true;
        }
    }

    advance() {
        if (this.#core.programCount > 0) {
            const pCount = Math.floor((MAX_PROGRAMS - 1) / this.#core.programCount);
            // console.log("NEXT is %d, Waiting for %d to equal %d (pcount %d, program count %d)", this.#core.nextProgramToPlay, this.#core.nextProgramToPlay * pCount, this.#tick % MAX_PROGRAMS, pCount, this.#core.programCount);
            if (this.#core.nextProgramToPlay * pCount == (this.#tick % MAX_PROGRAMS)) {
                const finished = this.#core.advance();
                const delta = this.#computeDelta();

                if (finished) {
                    console.log("Halted global core ???? There is trickery afoot");
                }

                this.#broadcastOnTicked(delta);
            }
        }

        this.#tick ++;
    }

    #computeDelta() {
        let delta = {};
        const pointers = this.#getOccupiedAddresses();

        for (let i = 0; i < this.#core.maxAddress; i++) {
            const value = this.#core.peek(i);

            // 4 bits for op (up to 15)  
            const op = (value >> compiler.OPERATION_SHIFT) & compiler.OPERATION_MASK;

            // 5 bits for lastWriter (up to 31)
            const owner = (this.#core.getLastWriterOfAdddress(i) & ((1 << 5) - 1));

            // 1 bit for pointer
            const hasPointer = pointers[i] == true;

            let summarized = 0;
            summarized |= op;
            summarized |= owner << 4;
            summarized |= hasPointer << (4 + 5);
            // = 10 bits (closest available: 16 bit integer)

            if (this.#serializedBuffer.readInt16LE(i * 2) != summarized) {
                this.#serializedBuffer.writeInt16LE(summarized, i * 2);
                delta[i] = summarized;
            }
        }

        return delta;
    }

    #getOccupiedAddresses() {
        const existingPointers = {};
        for (let i = 0; i < this.#core.programCount; i++) {
            const ptrs = this.#core.getProgramPointers(i);
            for (let k in ptrs.pointers) {
                existingPointers[ptrs.pointers[k]] = true;
            }
        }

        return existingPointers;
    }

    #grabProgramId() {
        if (this.#availableProgramIDs.length > 0) {
            return this.#availableProgramIDs.shift();
        }

        return false;
    }

    #onProgramKilled(victimId, killerId, reason) {
        // Update scores
        for (const k in this.#scores) {
            if (this.#scores[k].id == killerId) {
                this.#scores[k].kills++;
                break;
            }
        }

        // Remove victim from scores
        this.#scores = this.#scores.filter(o => o.id != victimId);
        this.#programs = this.#programs.filter(o => o.id != victimId);
        this.#availableProgramIDs.push(victimId); // Release ID

        console.log(`Program ${victimId} died (${reason}), releasing ID`);

        this.#broadcastOnScoreChanged(this.#scores);
    }
}