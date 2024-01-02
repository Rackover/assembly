const chalk = require("chalk");
const parser = require("./parser");
const compiler = require("./compiler");
const { Core } = require("./core");


module.exports = {
    printCoreMinimal: printCoreMinimal,
    printCoreExtended: printCoreExtended
}

function printCoreExtended(core) {
    const width = core.columnCount;
    const height = core.columnSize;

    const pointers = [];
    for (let i = 0; i < core.programCount; i++) {
        const ptrs = core.getProgramPointers(i).pointers;
        for (let j = 0; j < ptrs.length; j++) {
            pointers.push(ptrs[j]);
            break; // for now
        }
    }

    const lineLength = 8;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const memoryAddress =
                x * height
                + y;

            let value = core.peek(memoryAddress)

            let line;

            if (core.isSectorDead(memoryAddress)) {
                line = chalk.bgGray(' <DEAD> ');
            }
            else {

                const op = (value >> compiler.OPERATION_SHIFT) & compiler.OPERATION_MASK;
                if (op > 0) {
                    const operation = Object.keys(parser.OPERATIONS)[op];
                    if (operation) {
                        line = operation.toUpperCase().substring(0, lineLength).padEnd(lineLength);
                    }
                    else{
                        line = `? unk ${op}`.padEnd(lineLength).substring(0, lineLength);
                    }
                }
                else {

                    const valStr = value.toString().padStart(lineLength, '0');

                    if (value == 0) {
                        line = chalk.gray(valStr);
                    }
                    else {
                        line = chalk.white(valStr);
                    }
                }
            }

            for (let programIndex = 0; programIndex < pointers.length; programIndex++) {
                if (pointers[programIndex] == memoryAddress) {
                    switch (programIndex) {
                        case 0: line = chalk.bgRedBright(line); break;
                        case 1: line = chalk.bgBlueBright(line); break;
                    }

                    break;
                }
            }


            process.stdout.write(line);
            process.stdout.write(' ');
        }

        process.stdout.write('\n');
    }
}

function printCoreMinimal(core) {
    const width = core.columnCount;
    const height = core.columnSize;

    const pointers = [];
    for (let i = 0; i < core.programCount; i++) {
        const ptrs = core.getProgramPointers(i).pointers;
        for (let j = 0; j < ptrs.length; j++) {
            pointers.push(ptrs[j]);
            break; // for now
        }
    }


    const COL_WIDTH = 8;
    const columnLength = height / COL_WIDTH;
    for (let i = 0; i < columnLength; i++) {
        for (let index = 0; index < COL_WIDTH * width; index++) {
            const memoryAddress =
                index % COL_WIDTH
                + Math.floor(index / COL_WIDTH) * height
                + COL_WIDTH * i;

            const char = getCharForAddress(core, pointers, memoryAddress);

            process.stdout.write(char);
            if (((index + 1) % COL_WIDTH) == 0) {
                process.stdout.write(' ');
            }
        }

        process.stdout.write('\n');
    }
}

function getCharForAddress(core, pointers, memoryAddress) {
    const value = core.peek(memoryAddress);
    const op = (value >> compiler.OPERATION_SHIFT) & compiler.OPERATION_MASK;
    let char = '░';

    if (core.isSectorDead(memoryAddress)) {
        char = chalk.gray('X');
    }

    if (op == 0) {
        if (value != 0) {
            char = '▓';
        }
    }
    else {
        const operation = Object.keys(parser.OPERATIONS)[op];
        if (operation) {
            char = operation[0].toUpperCase();
        }
    }

    for (let programIndex = 0; programIndex < pointers.length; programIndex++) {
        if (pointers[programIndex] == memoryAddress) {
            switch (programIndex) {
                case 0: char = chalk.redBright(char); break;
                case 1: char = chalk.blueBright(char); break;
            }

            break;
        }
    }

    return char;
}