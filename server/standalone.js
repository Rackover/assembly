const parser = require('./shared/parser');
const compiler = require('./shared/compiler');
const { Core } = require('./core');
const corePrinter = require('./core_printer');
const { Rules } = require("./rules");

const fs = require('fs');
const reader = require("readline-sync");

module.exports = async function (options) {
    const programsToRun = [];
    let anyError = false;

    const programs = options.programs;
    const display = options.display;

    for (let i in programs) {
        const programName = programs[i];

        const programString = fs.readFileSync(programName, { encoding: "utf-8" });
        const tokens = parser.tokenize(programString);

        log.info(`Program ${programName} is ${(tokens.anyError ? "NOT VALID" : "valid!")}`);
        if (tokens.anyError) {
            log.debug(tokens);
            anyError = true;
            break;
        }
        else {
            // Run it alone
            const compiled = compiler.compile(tokens.tokens);
            const program = {
                name: programName,
                instructions: compiled
            };

            programsToRun.push(program);

            log.info(`Compiled ${programName} successfully into ${compiled.length / 4} instruction(s)`);

        }
    }

    if (!anyError) {
        const rules = new Rules();
        rules.runForever = true;
        const core = new Core(rules);

        core.installPrograms(programsToRun);

        log.info("ready");
        while (true) {
            if (display) {
                if (options.extended) {
                    corePrinter.printCoreExtended(core);
                }
                else {
                    corePrinter.printCoreMinimal(core);
                }
            }

            if (options.interactive) {
                const input = reader.question('Hit Enter key to continue.', { hideEchoBack: true, mask: '' });
                if (input != "") {
                    break;
                }
            }
            else {
                // Wait a few ms
                await wait(100);
            }
            const output = core.advance();

            if (output) {
                if (output.winner) {
                    log.info(`program ${output.winner.name} (#${output.winnerIndex}) is victorious!`);
                }
                else {
                    log.info(`lone program ${output.winner.name} terminated, end of simulation`);
                }

                break;
            }
            else {

                if (display) {
                    console.clear();
                }
            }
        }
    }
}

function wait(ms) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve(ms)
        }, ms)
    })
}