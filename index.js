const commandLineArgs = require('command-line-args')

const { format } = require('logform');
const winston = require('winston');
const tsFormat = () => (new Date()).toLocaleTimeString();

global.log = winston.createLogger({
    format: format.cli(),

    transports: [
        new (winston.transports.Console)({
            timestamp: tsFormat,
            colorize: true,
            level: 'debug'
        }),
        new (winston.transports.File)({
            filename: 'logs/bootclub.log',
            level: 'info'
        })
    ]
});

const options = commandLineArgs([
    { name: "display", type: Boolean },
    { name: "interactive", type: Boolean },
    { name: 'programs', type: String, multiple: true, defaultOption: true },
    { name: 'extended', type: Boolean }

]);

async function run() {
    if (options.programs && options.programs.length > 0) {
       require('./server/standalone')(options);
    }
    else {
        log.info("starting express");
        require('./server/server');
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