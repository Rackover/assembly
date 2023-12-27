const parser = require('./parser');
const compiler = require('./compiler');
const Core = require('./core');
const fs = require('fs');
const reader = require("readline-sync");
const corePrinter = require('./core_printer');
const commandLineArgs = require('command-line-args')
const Rules = require("./rules");


const options = commandLineArgs([
    { name: "display", type: Boolean },
    { name: "interactive", type: Boolean },
    { name: 'programs', type: String, multiple: true, defaultOption: true },
    { name: 'extended', type: Boolean }

]);

async function run() {
    if (options.programs && options.programs.length > 0) {
        const programsToRun = [];
        let anyError = false;

        const programs = options.programs;
        const display = options.display;

        for (let i in programs) {
            const programName = programs[i];

            const programString = fs.readFileSync(programName, { encoding: "utf-8" });
            const tokens = parser.tokenize(programString);

            console.log(`Program ${programName} is ${(tokens.anyError ? "NOT VALID" : "valid!")}`);
            if (tokens.anyError) {
                console.log(tokens);
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

                console.log(`Compiled ${programName} successfully into ${compiled.length / 4} instruction(s)`);

            }
        }

        if (!anyError) {
            const rules = new Rules();
            rules.runForever = true;
            const core = new Core(rules);

            core.installPrograms(programsToRun);

            console.log("ready");
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
                        console.log(`program ${output.winner.name} (#${output.winnerIndex}) is victorious!`);
                    }
                    else {
                        console.log(`lone program ${output.winner.name} terminated, end of simulation`);
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
    else {
        console.log("starting express");
        require('./server');
    }
}

function wait(ms) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve(ms)
        }, ms)
    })
}


run();