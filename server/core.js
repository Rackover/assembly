let isWeb = typeof window !== 'undefined';

const deps = {};

if (isWeb) {
    // HTML
    deps.ProgramPointer = ProgramPointer;
    deps.Rules = Rules;
    deps.compiler = compiler;
    deps.parser = parser;

    deps.Buffer = {
        alloc: function (size) {
            return new ArrayBuffer(size);
        }
    }


} else {
    // NODE
    const { ProgramPointer } = require('./program_pointer')
    const { Rules } = require('./rules');

    deps.ProgramPointer = ProgramPointer;
    deps.Rules = Rules;
    deps.compiler = require('./shared/compiler');
    deps.parser = require('./shared/parser');
    deps.Buffer = Buffer;
}

const OP_COMPARISONS = {};
OP_COMPARISONS[deps.parser.OPERATIONS.SKIP_IF_EQUAL] = (a, b) => a == b;
OP_COMPARISONS[deps.parser.OPERATIONS.SKIP_IF_GREATER] = (a, b) => a > b;
OP_COMPARISONS[deps.parser.OPERATIONS.SKIP_IF_LOWER] = (a, b) => a < b;

module.exports.Core = class {
    #columnSize;
    #columnCount;

    #rules;

    #memoryBuffer;
    #writeBuffer;
    #readBuffer;
    #ownershipBuffer;

    #pointerGroups = [];
    #programs = [];
    #turnOfProgram = 0;
    #lastKillReason;


    get lastKillReason() { return this.#lastKillReason; }

    get rules() { return this.#rules; }

    constructor(rules = new deps.Rules()) {
        this.#columnSize = rules.columnSize;
        this.#columnCount = rules.columnCount;
        this.#rules = rules;

        this.#memoryBuffer = deps.Buffer.alloc(this.maxAddress * 4);
        this.#writeBuffer = deps.Buffer.alloc(this.maxAddress);
        this.#readBuffer = deps.Buffer.alloc(this.maxAddress);
        this.#ownershipBuffer = deps.Buffer.alloc(this.maxAddress);
    }

    // EVENTS

    #killEventListeners = [];
    onProgramKilled(lambda) {
        this.#killEventListeners.push(lambda);
    }

    #broadcastOnProgramKilled(programId, killer, killReason) {
        for (const k in this.#killEventListeners) {
            this.#killEventListeners[k](programId, killer, killReason);
        }
    }

    // END OF

    isEmpty() {
        return this.programCount == 0;
    }

    peek(address) {
        return this.#getValueAtAddress(address, true);
    }

    getLastWriterOfAdddress(address) {
        const ownerId = this.#ownershipBuffer[this.#getSafeAddress(address)];

        if (ownerId != 0) {
            for (let k in this.#pointerGroups) {
                if (this.#pointerGroups[k].programId == ownerId) {
                    return ownerId;
                }
            }
        }

        return 0; // Owner is dead or does not exist no more
    }

    get programCount() {
        return this.#programs.length;
    }

    get nextProgramToPlay() {
        return this.#turnOfProgram;
    }

    isSectorDead(address) {
        return (this.#rules.maxWritePerSector != 0 &&
            this.#writeBuffer[this.#getSafeAddress(address)] >= this.#rules.maxWritePerSector)
            || (this.#rules.maxReadPerSector != 0 &&
                this.#readBuffer[this.#getSafeAddress(address)] >= this.#rules.maxReadPerSector);
    }

    getProgramPointers(programIndex) {
        const programPointer = this.#pointerGroups[programIndex];
        return programPointer;
    }

    // return false if it needs to run again, otherwise returns an object
    advance() {
        if (this.#pointerGroups.length == 0) {
            if (this.#rules.runForever) {
                return;
            }
            else {
                return true; // Done - nothing to run
            }
        }

        if (this.#turnOfProgram >= this.#pointerGroups.length) {
            log.error(`Not sure what happened but it's turn of program ${this.#turnOfProgram} and I only have ${this.#pointerGroups.length} programs to run, so I'm gonna correct it and dump some stuff.`);

            log.error(`POINTER GROUPS: ${JSON.stringify(this.#pointerGroups)}`);
            log.error(`INSTALLED PROGRAMS: ${JSON.stringify(this.#programs)}`);

            this.#turnOfProgram = 0;
        }

        const programPointer = this.#pointerGroups[this.#turnOfProgram];

        const memoryPosition = programPointer.pointers[programPointer.nextPointerToExecute];

        this.#executePointerGroup(programPointer);

        if (programPointer.isDead) {

            this.#broadcastOnProgramKilled(
                programPointer.programId,
                this.getLastWriterOfAdddress(memoryPosition),
                this.lastKillReason
            );

            if (this.#rules.runForever) {
                this.#programs.splice(this.#turnOfProgram, 1);
                this.#pointerGroups.splice(this.#turnOfProgram, 1);
            }
            else {
                let winnerIndex = -1;
                let atLeastOneProgramAlive = false
                for (const programIndex in this.#pointerGroups) {
                    if (this.#pointerGroups[programIndex].isDead) {
                        continue;
                    }

                    atLeastOneProgramAlive = true;
                    if (winnerIndex == -1) {
                        winnerIndex = programIndex;
                    }
                    else {
                        // More than 1 program remaining, do nothing
                        break;
                    }
                }

                if (winnerIndex != -1) {
                    return { winner: this.#programs[winnerIndex], winnerIndex: winnerIndex };
                }

                if (!atLeastOneProgramAlive) {
                    return { winner: false };
                }
            }
        }
        else {
            programPointer.nextPointerToExecute = (programPointer.nextPointerToExecute + 1) % programPointer.pointers.length;
        }

        this.#turnOfProgram ++;
        this.capNextProgramToPlay();

        return false;
    }

    capNextProgramToPlay()
    {
        if (this.#programs.length <= 0) {
            this.#turnOfProgram = 0;
        }
        else {
            this.#turnOfProgram = this.#turnOfProgram % this.#programs.length;
        }
    }

    installProgram(program, position) {
        // Place program
        if (position * 4 + program.instructions.length < this.#memoryBuffer.length) {
            // Fast copy, no fragmentation
            log.debug(`Installing program ${program.name}:${program.id} at ${position} (fast copy)`);
            program.instructions.copy(this.#memoryBuffer, position * 4);
        }
        else {
            // slow copy, needs rollover
            log.debug(`Installing program ${program.name}:${program.id} at ${position} (slow copy)`);
            for (let i = 0; i < program.instructions.length / 4; i++) {
                this.#memoryBuffer.writeInt32LE(
                    this.#memoryBuffer.readInt32LE(i * 4),
                    ((position + i) % this.maxAddress) * 4
                );
            }
        }

        // Do we even need this anymore?
        const placedProgram = {
            start: position,
            end: position + program.instructions.length
        };

        for (let address = placedProgram.start; address < placedProgram.end; address++) {
            const safe = this.#getSafeAddress(address);
            this.#ownershipBuffer[safe] = false; // Reset writes here
        }

        // Programs are placed, let's initialize pointers
        this.#pointerGroups.push(new deps.ProgramPointer(program.id, placedProgram.start));
        this.#programs.push(placedProgram);
    }

    installPrograms(programsToPlace) {
        const placedPrograms = [];

        for (i in programsToPlace) {
            let program = programsToPlace[i];

            while (true) {
                let randomByteOffset = Math.floor(Math.random() * (this.maxAddress - program.instructions.length / 4)) * 4;
                let areaIsFree = true;
                for (let j in placedPrograms) {
                    if (randomByteOffset > placedPrograms[j].start && randomByteOffset <= placedPrograms[j].end) {
                        // Not good
                        areaIsFree = false;
                        break;
                    }
                }

                if (areaIsFree) {
                    // Place program
                    program.instructions.copy(this.#memoryBuffer, randomByteOffset);
                    placedPrograms.push({ start: randomByteOffset, end: randomByteOffset + program.instructions.length })
                    break;
                }
            }
        }

        // Programs are placed, let's initialize pointers
        for (i in programsToPlace) {
            this.#pointerGroups.push(new deps.ProgramPointer(placedPrograms[i].programId, placedPrograms[i].start / 4));
            this.#programs.push(programsToPlace[i]);
        }
    }

    killProgram(index) {
        const programPointer = this.getProgramPointers(index);
        log.info(`Force killing program ${programPointer.programId} (pointer is valid? ${programPointer != undefined})`);

        while (!programPointer.isDead) {
            this.#killPointer(programPointer);
        }

        log.info(`Done force killing program ${programPointer.programId}`);

        this.#pointerGroups.splice(index, 1);
        this.#programs.splice(index, 1);

        if (this.#turnOfProgram == index) {
            this.#turnOfProgram = this.#programs.length <= 0 ?
                0 :
                ((this.#turnOfProgram + 1) % this.#programs.length);

            log.info(`It was this program's turn to play (${index}) so I made it ${this.#turnOfProgram}'s turn instead`);
        }

        this.#broadcastOnProgramKilled(
            programPointer.programId,
            false,
            "forced termination"
        );
    }

    #setValueAtAddress(value, address) {
        const MAX_INT32 = 2147483647;
        const MIN_INT32 = -2147483648;

        const clamped =
            value > MAX_INT32 ? MIN_INT32 + value % MAX_INT32 :
                (value < MIN_INT32 ? MAX_INT32 + value % MIN_INT32 :
                    value);

        this.#memoryBuffer.writeInt32LE(clamped, this.#getSafeAddress(address) * 4);
    }

    #getSafeAddress(address) {
        let safeAddress = address % this.maxAddress;
        while (safeAddress < 0) {
            safeAddress = this.maxAddress + safeAddress;
        }

        return safeAddress;
    }

    #getValueAtAddress(address, ignoreDeadSectors) {
        if (!ignoreDeadSectors && this.isSectorDead(address)) {
            return false;
        }

        return this.#memoryBuffer.readInt32LE(this.#getSafeAddress(address) * 4);
    }

    #getArgumentInternal(data, memoryPosition, operandShift, operandFlagsShift) {
        const rawOperand = (data >> operandShift) & deps.compiler.OPERAND_MASK;

        let value = rawOperand;
        value = deps.compiler.getSignedXBitsValue(value);

        let depth = (data >> operandFlagsShift) & deps.compiler.OPERAND_FLAGS_MASK;
        while (depth > 0) {
            depth--;
            value = this.#getValueAtAddress(memoryPosition + value);
            if (value === false) {
                return false;
            }
            else {
                this.#markSectorRead(memoryPosition + value);
            }
        }

        return value;
    }

    #getArgumentB(data, memoryPosition) {
        return this.#getArgumentInternal(data, memoryPosition, deps.compiler.OPERAND_B_SHIFT, deps.compiler.OPERAND_B_FLAGS_SHIFT);
    }

    #getArgumentA(data, memoryPosition) {
        return this.#getArgumentInternal(data, memoryPosition, deps.compiler.OPERAND_A_SHIFT, deps.compiler.OPERAND_A_FLAGS_SHIFT);
    }

    #killPointer(programPointer) {
        log.debug(`Killing pointer ${programPointer.nextPointerToExecute} out of ${programPointer.pointers.length} for program ${programPointer.programId}`);
        programPointer.pointers.splice(programPointer.nextPointerToExecute, 1);

        if (programPointer.isDead && this.#rules.clearOwnershipOnDeath) {
            log.debug(`Clearing ownership of ${programPointer.programId}...`);
            for (let i = 0; i < this.maxAddress; i++) {
                if (this.#ownershipBuffer[i] == programPointer.programId) {
                    this.#ownershipBuffer[i] = 0;
                }
            }
        }

        log.debug(`Done killing pointer ${programPointer.nextPointerToExecute} of ${programPointer.programId}`);
    }

    #executePointerGroup(programPointer) {
        let memoryPosition = programPointer.pointers[programPointer.nextPointerToExecute];
        let moved = false;

        const data = this.#getValueAtAddress(memoryPosition);
        this.#markSectorRead(memoryPosition);

        if (data === false) {
            this.#killPointer(programPointer);
            this.#lastKillReason = `interaction with bad sector`;
        }
        else {
            const op = (data >> deps.compiler.OPERATION_SHIFT) & deps.compiler.OPERATION_MASK;

            switch (op) {
                default:
                case deps.parser.OPERATIONS.DATA:
                    // dies!
                    this.#killPointer(programPointer);

                    const keys = Object.keys(deps.parser.OPERATIONS);
                    this.#lastKillReason = `the delegate tried to execute invalid or non-executable instruction '${(op < keys.length && op >= 0) ? keys[op] : op}' [${data}]`;
                    return;

                case deps.parser.OPERATIONS.NOOP:
                    // Do nothing
                    break;

                // All arithmetic is very similar
                case deps.parser.OPERATIONS.ADD:
                case deps.parser.OPERATIONS.SUBTRACT:
                case deps.parser.OPERATIONS.MULTIPLY:
                    {
                        const operand = this.#getArgumentA(data, memoryPosition);
                        const b = this.#getArgumentB(data, memoryPosition);

                        if (b === false) {
                            this.#killPointer(programPointer);
                            this.#lastKillReason = `bad sector read`;
                            return;
                        }

                        const whereTo = b + memoryPosition;
                        let result = this.#getValueAtAddress(whereTo);
                        if (op == deps.parser.OPERATIONS.MULTIPLY) {
                            result *= operand;
                        }
                        else {
                            result += operand * (op == deps.parser.OPERATIONS.SUBTRACT ? -1 : 1);
                        }


                        this.#setValueAtAddress(
                            result,
                            whereTo
                        );

                        this.#markSectorRead(whereTo);
                        this.#markSectorWritten(whereTo, programPointer.programId);

                        break;
                    }

                case deps.parser.OPERATIONS.SKIP_IF_EQUAL:
                case deps.parser.OPERATIONS.SKIP_IF_GREATER:
                case deps.parser.OPERATIONS.SKIP_IF_LOWER:
                    {
                        const valueA = this.#getArgumentA(data, memoryPosition);
                        const valueB = this.#getArgumentB(data, memoryPosition);

                        if (valueA === false || valueB === false) {
                            this.#killPointer(programPointer);
                            this.#lastKillReason = `bad sector read`;
                            return;
                        }

                        if (OP_COMPARISONS[op](valueA, valueB)) {
                            memoryPosition += 2;
                            moved = true;
                        }

                        break;
                    }

                case deps.parser.OPERATIONS.WRITE:
                    {
                        const toWrite = this.#getArgumentA(data, memoryPosition);
                        const b = this.#getArgumentB(data, memoryPosition);

                        if (b === false) {
                            this.#killPointer(programPointer);
                            this.#lastKillReason = `bad sector read`;
                            return;
                        }

                        const whereTo = b + memoryPosition;

                        this.#setValueAtAddress(
                            toWrite,
                            whereTo
                        );

                        this.#markSectorWritten(whereTo, programPointer.programId);

                        break;
                    }

                case deps.parser.OPERATIONS.COPY:
                case deps.parser.OPERATIONS.MOVE:
                    {
                        const a = this.#getArgumentA(data, memoryPosition);
                        const b = this.#getArgumentB(data, memoryPosition);


                        if (a === false || b === false) {
                            this.#killPointer(programPointer);
                            this.#lastKillReason = `bad sector read`;
                            return;
                        }

                        const origin = a + memoryPosition;
                        const destination = b + memoryPosition;

                        const value = this.#getValueAtAddress(origin);

                        this.#setValueAtAddress(
                            value,
                            destination
                        );

                        this.#markSectorRead(origin);
                        this.#markSectorWritten(destination, programPointer.programId);

                        if (op == deps.parser.OPERATIONS.MOVE) {
                            this.#setValueAtAddress(0, origin);
                            this.#markSectorWritten(origin, programPointer.programId);
                        }

                        break;
                    }

                case deps.parser.OPERATIONS.JUMP:
                    {
                        const a = this.#getArgumentA(data, memoryPosition);

                        if (a === false) {
                            this.#killPointer(programPointer);
                            this.#lastKillReason = `bad sector read`;
                            return;
                        }

                        const destination = a + memoryPosition;
                        memoryPosition = this.#getSafeAddress(destination);
                        moved = true;
                        break;
                    }
            }

            if (!moved) {
                memoryPosition++;
            }

            programPointer.pointers[programPointer.nextPointerToExecute] = this.#getSafeAddress(memoryPosition);
        }
    }

    #markSectorWritten(address, byProgram) {
        const addr = this.#getSafeAddress(address);
        this.#writeBuffer[addr]++;
        if (byProgram !== false) {
            this.#ownershipBuffer[addr] = byProgram;
        }
    }

    #markSectorRead(address) {
        this.#readBuffer[this.#getSafeAddress(address)]++;
    }

    get buffer() {
        return this.#memoryBuffer;
    }

    get columnSize() {
        return this.#columnSize;
    }

    get columnCount() {
        return this.#columnCount;
    }

    get maxAddress() {
        return this.#columnSize * this.#columnCount;
    }
}
