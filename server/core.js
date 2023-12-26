const ProgramPointer = require('./program_pointer')
const Rules = require('./rules');
const compiler = require('./compiler')
const parser = require('./parser')

module.exports = class Core {
    #columnSize;
    #columnCount;

    #rules;

    #memoryBuffer;
    #writeBuffer;
    #readBuffer;

    #pointerGroups = [];
    #programs = [];
    #turnOfProgram = 0;

    constructor(rules = new Rules()) {
        this.#columnSize = rules.columnSize;
        this.#columnCount = rules.columnCount;
        this.#rules = rules;

        this.#memoryBuffer = Buffer.alloc(this.maxAddress * 4);
        this.#writeBuffer = Buffer.alloc(this.maxAddress);
        this.#readBuffer = Buffer.alloc(this.maxAddress);
    }

    isEmpty()
    {
        return this.#programs.length() == 0;
    }

    peek(address) {
        return this.#getValueAtAddress(address, true);
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
        return programPointer.pointers;
    }

    advance() {
        const programPointer = this.#pointerGroups[this.#turnOfProgram];

        this.#executePointerGroup(programPointer);

        if (programPointer.isDead) {
            
            if (this.#rules.runForever)
            {
                this.#programs.splice(this.#turnOfProgram, 1);
                this.#pointerGroups.splice(this.#turnOfProgram, 1);
            }
            else
            {
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

                if (!atLeastOneProgramAlive)
                {
                    return {winner: false};
                }
            }
        }
        else {
            programPointer.nextPointerToExecute = (programPointer.nextPointerToExecute + 1) % programPointer.pointers.length;
        }

        this.#turnOfProgram = (this.#turnOfProgram + 1) % this.#programs.length;

        return false;
    }

    installPrograms(programsToPlace) {
        const placedPrograms = [];

        for (i in programsToPlace) {
            let program = programsToPlace[i];

            while (true) {
                let randomByteOffset = Math.floor(Math.random() * (this.maxAddress - program.instructions.length/4)) * 4;
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
            this.#pointerGroups.push(new ProgramPointer(placedPrograms[i].start / 4));
            this.#programs.push(programsToPlace[i]);
        }
    }

    #setValueAtAddress(value, address) {
        this.#memoryBuffer.writeInt32LE(value, this.#getSafeAddress(address) * 4);
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
        const rawOperand = (data >> operandShift) & compiler.OPERAND_MASK;

        let value = rawOperand;
        value = compiler.getSigned12BitsValue(value);

        let depth = (data >> operandFlagsShift) & compiler.OPERAND_FLAGS_MASK;
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
        return this.#getArgumentInternal(data, memoryPosition, compiler.OPERAND_B_SHIFT, compiler.OPERAND_B_FLAGS_SHIFT);
    }

    #getArgumentA(data, memoryPosition) {
        return this.#getArgumentInternal(data, memoryPosition, compiler.OPERAND_A_SHIFT, compiler.OPERAND_A_FLAGS_SHIFT);
    }

    #killPointer(programPointer) {
        programPointer.pointers.splice(programPointer.nextPointerToExecute, 1);
    }

    #executePointerGroup(programPointer) {
        let memoryPosition = programPointer.pointers[programPointer.nextPointerToExecute];
        let moved = false;

        const data = this.#getValueAtAddress(memoryPosition);
        this.#markSectorRead(memoryPosition);

        if (data === false) {
            this.#killPointer(programPointer);
            console.log(`program died (interaction with bad sector)`);
        }
        else {
            const op = (data >> compiler.OPERATION_SHIFT) & compiler.OPERATION_MASK;
            console.log(`executing ${op} at ${memoryPosition} [${data}]`);

            switch (op) {
                default:
                case parser.OPERATIONS.DATA:
                    // dies!
                    this.#killPointer(programPointer);
                    console.log(`program died (met operation ${op} [${data}])`);
                    return;

                case parser.OPERATIONS.ADD:
                case parser.OPERATIONS.SUBTRACT:
                    {
                        const toAdd = this.#getArgumentA(data, memoryPosition);
                        const b = this.#getArgumentB(data, memoryPosition);

                        if (b === false) {
                            this.#killPointer(programPointer);
                            console.log(`program died (bad sector read)`);
                            return;
                        }

                        const whereTo = b + memoryPosition;
                        this.#setValueAtAddress(
                            toAdd * (op == parser.OPERATIONS.SUBTRACT ? -1 : 1) + this.#getValueAtAddress(whereTo),
                            whereTo
                        );

                        this.#markSectorRead(whereTo);
                        this.#markSectorWritten(whereTo);

                        break;
                    }

                case parser.OPERATIONS.SKIP_IF_EQUAL:
                    {
                        const valueA = this.#getArgumentA(data, memoryPosition);
                        const valueB = this.#getArgumentB(data, memoryPosition);

                        if (valueA === false || valueB === false) {
                            this.#killPointer(programPointer);
                            console.log(`program died (bad sector read)`);
                            return;
                        }

                        if (valueA == valueB) {
                            memoryPosition += 2;
                            moved = true;
                        }

                        break;
                    }

                case parser.OPERATIONS.WRITE:
                    {
                        const toWrite = this.#getArgumentA(data, memoryPosition);
                        const b = this.#getArgumentB(data, memoryPosition);

                        if (b === false) {
                            this.#killPointer(programPointer);
                            console.log(`program died (bad sector read)`);
                            return;
                        }

                        const whereTo = b + memoryPosition;

                        this.#setValueAtAddress(
                            toWrite,
                            whereTo
                        );

                        this.#markSectorWritten(whereTo);

                        break;
                    }

                case parser.OPERATIONS.COPY:
                case parser.OPERATIONS.MOVE:
                    {
                        const a = this.#getArgumentA(data, memoryPosition);
                        const b = this.#getArgumentB(data, memoryPosition);


                        if (a === false || b === false) {
                            this.#killPointer(programPointer);
                            console.log(`program died (bad sector read)`);
                            return;
                        }

                        const origin = a + memoryPosition;
                        const destination = b + memoryPosition;

                        this.#setValueAtAddress(
                            this.#getValueAtAddress(origin),
                            destination
                        );

                        this.#markSectorRead(origin);
                        this.#markSectorWritten(destination);

                        if (op == parser.OPERATIONS.MOVE) {
                            this.#setValueAtAddress(0, origin);
                            this.#markSectorWritten(origin);
                        }

                        break;
                    }

                case parser.OPERATIONS.JUMP:
                    {
                        const a = this.#getArgumentA(data, memoryPosition);

                        if (a === false) {
                            this.#killPointer(programPointer);
                            console.log(`program died (bad sector read)`);
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

            programPointer.pointers[programPointer.nextPointerToExecute] = memoryPosition;
        }
    }

    #markSectorWritten(address) {
        this.#writeBuffer[this.#getSafeAddress(address)]++;
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