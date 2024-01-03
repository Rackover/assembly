const parser = require('./shared/parser');
const compiler = require('./shared/compiler');
const { Rules } = require('./rules');
const { Core } = require('./core');
const blacklist = require('./blacklist');

const BYSTANDER_NAMES = [
    "Maverick",
    "Goose",
    "Viper",
    "Iceman",
    "Hollywood",
    "Charlie",
    "Jester",
    "Stinger",
    "Wolfman",
    "Merlin",
    "Slider",
    "Chipper",
    "Sundown",
    "Sark",
    "Clu",
    "Yori",
    "Crom",
    "Ram",
    "Chip",
    "Thorne",
    "Rinzler",
    "Tesler",
    "Link",
    "Pavel",
    "Zero",
    "Hurricane",
    "Typhoon",
    "Tornado",
    "Mirage",
    "Castor",
    "Roc",
    "Louve",
    "Striker",
    "Lancaster",
    "Kanoziev",
    "Maddox",
    "Trooper",
    "Aiglon",
    "Manta",
    "Sugar",
    "Thunder",
    "Dancer",
    "Crow",
    "Raven",
    "Xunlai",
    "Moose"
]

// const BYSTANDER_CODE = `copy 3 to 4\nadd 1 to the value at 3\njump -2`;

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
    #internalTick = 0;
    #fullTick = 0;
    #serializedBuffer;
    #scores = [];

    #lastPlayerProgramActivity = 0;
    #isBystander = {};

    get columnSize() {
        return this.#core.columnSize;
    }

    get columnCount() {
        return this.#core.columnCount;
    }

    get scores() {
        return this.#scores;
    }

    get serializedBuffer() {
        return this.#serializedBuffer;
    }

    get programCount() {
        return this.#core.programCount;
    }

    get activePointers() {
        const active = {};
        const nextToPlay = this.#core.getProgramPointers(this.#core.nextProgramToPlay);
        for (let i = 0; i < this.#core.programCount; i++) {
            const ptrs = this.#core.getProgramPointers(i);
            active[ptrs.programId] = {
                address: ptrs.nextAddressToExecute,
                executesNext: nextToPlay === ptrs,
                isBystander: this.#isBystander[ptrs.programId]
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

        for (let i = 0; i < CONFIG.MAX_PROGRAMS; i++) {
            this.#availableProgramIDs.push(i + 1);
        }

        this.#createBystanders(rules.bystanders);

        this.#interval = setInterval(this.advance.bind(this), CONFIG.CORE_SPEED / CONFIG.MAX_PROGRAMS);
    }

    kill() {
        clearInterval(this.#interval);
    }

    installProgram(name, code, fromAddress = false) {
        if (fromAddress !== false) { // Remote client - exercise caution
            if (blacklist.isBlacklistedName(name)) {
                blacklist.ban(fromAddress);
                log.warn(`Excluding client with address ${fromAddress} due to creating a program named [${name}]`);
                return [false, "You have been booted off the assembly! Please reach out on the discord for further assistance."];
            }
        }

        name = name.trim();

        // Check if name already exists
        for(const k in this.#programs)
        {
            if (this.#programs[k].name.trim().toLowerCase() == name.toLowerCase())
            {
                return [false, "Another delegate with the same name is already running!"];
            }
        }

        const id = this.#grabProgramId();

        if (id === false) {
            return [false, "The assembly is full and cannot accept new delegates at the time"];
        }

        const tokens = parser.tokenize(code);

        if (tokens.anyError) {
            return [false, "The delegate did not compile successfully due to an error in the instructions"];
        }
        else {
            const compiled = compiler.compile(tokens.tokens);

            if (fromAddress !== false) { // Remote client - exercise caution
                const blacklistReason = blacklist.isBlacklisted(compiled);
                if (blacklistReason) {
                    log.info(`Refused program [${name}] from address ${fromAddress}: ${blacklistReason}`);
                    this.#availableProgramIDs.push(id);
                    return [false, "The assembly declared your program harmful and refused your delegate. Please update your instructions and re-submit."];
                }
            }

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
                emptySegments.sort(function (a, b) { return a.length < b.length ? 1 : -1 });

                position = emptySegments[0].start + Math.floor(emptySegments[0].length / 2);
            }

            log.info(`Global core: installing program ${program.name}:${program.id} at position ${position}`);
            this.#core.installProgram(program, position);
            this.#programs.push(program);
            this.#scores.push({
                id: id,
                name: program.name,
                kills: 0
            });

            this.#lastPlayerProgramActivity = this.#fullTick;

            return [id, "success"];
        }
    }

    advance() {
        if (this.#core.programCount > 0) {
            const pCount = Math.floor((CONFIG.MAX_PROGRAMS - 1) / this.#core.programCount);
            // console.log("NEXT is %d, Waiting for %d to equal %d (pcount %d, program count %d)", this.#core.nextProgramToPlay, this.#core.nextProgramToPlay * pCount, this.#tick % MAX_PROGRAMS, pCount, this.#core.programCount);
            if (this.#core.nextProgramToPlay * pCount == (this.#internalTick % CONFIG.MAX_PROGRAMS)) {
                const finished = this.#core.advance();
                const delta = this.#computeDelta();

                if (finished) {
                    log.error("Halted global core ???? There is trickery afoot");
                }

                this.#broadcastOnTicked(delta);
                this.#fullTick ++;
            }
        }
        else {
            this.#fullTick++;
        }

        if (this.#core.programCount < this.#core.rules.bystanders &&
            this.#fullTick - this.#lastPlayerProgramActivity > this.#core.rules.repopulateBystanderEveryTick) {

            log.debug(`Program count is ${this.#core.programCount} (< ${this.#core.rules.bystanders}) and last program activity was ${(this.#fullTick - this.#lastPlayerProgramActivity)} ticks ago (${this.#fullTick} - ${this.#lastPlayerProgramActivity}), creating a new bystander`);
            this.#createBystanders(1);
        }

        this.#internalTick ++;
    }

    getProgramInstructions(id) {
        for (const k in this.#programs) {
            if (this.#programs[k].id == id) {
                return this.#programs[k].instructions;
            }
        }

        return false;
    }

    #createBystanders(count) {
        for (let i = 0; i < count; i++) {
            const name = `${BYSTANDER_NAMES[Math.floor(Math.random() * BYSTANDER_NAMES.length)].toLowerCase()}.d`;
            const [id, reason] = this.installProgram(name, generateBystanderCode());

            if (id === false) {
                log.info(`Did not create bystander! ${reason}`);
                break;
            }

            log.info(`Created bystander ${name}:${id}`);
            this.#isBystander[id] = true;
        }
    }

    #computeDelta() {
        let delta = {};
        const pointers = this.#getOccupiedAddresses();

        for (let i = 0; i < this.#core.maxAddress; i++) {
            const value = this.#core.peek(i);

            let writer = this.#core.getLastWriterOfAdddress(i);
            if (this.#isBystander[writer]) {
                // Bystanders are gray
                writer = 0;
            }

            // 4 bits for op (up to 15)  
            const op = (value >> compiler.OPERATION_SHIFT) & compiler.OPERATION_MASK;

            // 5 bits for lastWriter (up to 31)
            const owner = (writer & ((1 << 5) - 1));

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
        if (this.#isBystander[victimId]) {
            delete this.#isBystander[victimId];
        }

        log.info(`Program ${victimId} died (${reason}), releasing ID`);

        this.#lastPlayerProgramActivity = this.#fullTick;
        this.#broadcastOnScoreChanged(this.#scores);
    }
}

function generateBystanderCode() {
    function randomInt(min, max) {
        return Math.floor(Math.random() * (max - min) + min);
    }

    if (Math.random() < 0.3) { // Permanent runners
        const instructions = [];
        
        // TODO Wall
        if (Math.random() < 0.4)
        {

        }
        else{
            instructions.push(`add ${randomInt(117, 263)} to 10`);

            if (Math.random() < 0.5) {
                instructions.push(`copy 3 to the address specified at 9`);
            } else {
                instructions.push(`copy 2 to -${randomInt(1, 10)}`);
            }

            if (Math.random() < 0.5) {
                instructions.push(`add ${randomInt(1, 2)} to the value at -${randomInt(3, 4)}`);
            }
            else {
                let f = 0.0;
                while (Math.random() > f) {
                    f += 0.25;
                    instructions.push(`copy 1 to ${randomInt(5, 8)}`);
                }
            }

            instructions.push(`go to -${instructions.length}`);
        }

        return instructions.join('\n');
    }
    else { // Suicide
        return `add 1 to 3
        skip if the value at 2 equals ${randomInt(11, 45)}
        jump -2
        data 0`;
    }
}