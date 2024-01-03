const parser = require('./shared/parser');
const compiler = require('./shared/compiler');
const { Rules } = require('./rules');
const { Core } = require('./core');

module.exports = class {
    get EState() {
        return {
            INVALID: 0,
            RUNNING: 1,
            HALTED: 2
        }
    };

    state = this.EState.INVALID;

    #program;
    #core;
    #haltReason;

    get compiledProgram() {
        return this.#program.instructions;
    }

    get haltReason() {
        return this.#haltReason;
    }

    get columnSize() {
        return this.#core.columnSize;
    }

    get columnCount() {
        return this.#core.columnCount;
    }

    get nextAddressToExecute() {
        const ptrs = this.#core.getProgramPointers(0);
        return ptrs.nextAddressToExecute;
    }

    constructor(programName, programString) {
        const tokens = parser.tokenize(programString);

        if (tokens.anyError) {
            this.state = this.EState.INVALID;

            for (const k in tokens.tokens) {
                if (tokens.tokens[k].isError) {
                    this.#haltReason = tokens.tokens[k].errorMessage;
                    break;
                }
            }
        }
        else {
            const compiled = compiler.compile(tokens.tokens);

            this.#program = {
                name: programName,
                instructions: compiled,
                id: 1
            };

            const rules = new Rules();
            rules.runForever = false;
            rules.columnCount = 3;

            const core = new Core(rules);

            core.installProgram(this.#program, 0);
            this.#core = core;

            this.state = this.EState.RUNNING;
        }
    }

    advance() {
        const finished = this.#core.advance();

        if (finished) {
            this.state = this.EState.HALTED;
            this.#haltReason = this.#core.lastKillReason;
        }
    }

    dumpCoreToBuffer(buff) {
        let delta = {};

        for (let i = 0; i < this.#core.maxAddress; i++) {
            const value = this.#core.peek(i);

            if (buff.readInt32LE(i * 4) != value) {
                buff.writeInt32LE(value, i * 4);
                delta[i] = value;
            }
        }

        return delta;
    }

    dumpCore() {
        const buff = Buffer.alloc(this.#core.maxAddress * 4);
        this.dumpCoreToBuffer(buff);

        return buff;
    }

    dumpFlagsToBuffer(buff) {
        let delta = {};

        for (let i = 0; i < this.#core.maxAddress; i++) {
            const b = (this.#core.getLastWriterOfAdddress(i) != 0);
            if (b != buff[i]) {
                buff[i] |= b; // Owner shift
                delta[i] = b;
            }
        }

        return delta;
    }

    dumpFlags() {
        const buff = Buffer.alloc(this.#core.maxAddress);
        this.dumpFlagsToBuffer(buff);

        return buff;
    }
}