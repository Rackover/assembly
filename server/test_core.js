const parser = require('./parser');
const compiler = require('./compiler');
const Rules = require('./rules');
const Core = require('./core');

module.exports = class
{
    get EState(){ return {
        INVALID: 0,
        RUNNING: 1,
        HALTED: 2
    }};

    state = this.EState.INVALID;

    #program;
    #core;

    get columnSize() {
        return this.#core.columnSize;
    }

    get columnCount() {
        return this.#core.columnCount;
    }

    constructor(programName, programString)
    {
        const tokens = parser.tokenize(programString);

        if (tokens.anyError)
        {
            state = this.EState.INVALID;
        }
        else
        {
            const compiled = compiler.compile(tokens.tokens);
            
            this.#program = {
                name: programName,
                instructions: compiled,
                id: 1
            };

            const rules = new Rules();
            rules.runForever = true;
            rules.columnCount = 3;

            const core = new Core(rules);

            core.installProgram(this.#program, core.columnSize * (core.columnCount/2));
            this.#core = core;

            this.state = this.EState.RUNNING;
        }
    }

    advance()
    {
        console.log("Advancing test core");
        const finished = this.#core.advance();

        if (finished)
        {
            state = this.EState.HALTED;
            console.log("Halted test core");
        }
    }

    dumpToBuffer(buff)
    {
        for (let i = 0; i < this.#core.maxAddress; i++)
        {
            const value = this.#core.peek(i);
            const op = (value >> compiler.OPERATION_SHIFT) & compiler.OPERATION_MASK;

            if (value != 0)
            {
                console.log();
            }

            if (op >= 0 && op <= parser.MAX_OP)
            {
                buff[i] = op;
            }
            else
            {
                buff[i] = 0;
            }

            buff[i] |= (this.#core.getLastWriterOfAdddress(i)%(1 << 4)) << 4; // Owner shift
        }
    }

    dump()
    {
        const buff = Buffer.alloc(this.#core.maxAddress);
        this.dumpToBuffer(buff);

        return buff;
    }
}