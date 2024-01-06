const commandLineArgs = require('command-line-args')

const { format } = require('logform');
const winston = require('winston');
const tsFormat = () => (new Date()).toLocaleTimeString();
const fs = require('fs');

const ACTIVITY_LOG_FILE = "logs/activity.log";

// Rotate log
if (fs.existsSync(ACTIVITY_LOG_FILE)) {
    const { birthtime } = fs.statSync(ACTIVITY_LOG_FILE)
    const timeString = birthtime.toISOString().split('T')[0];
    const targetName = `${ACTIVITY_LOG_FILE}.${timeString}`;
    if (fs.existsSync(targetName)) {
        // Merge
        fs.writeFileSync(
            targetName,
            `${fs.readFileSync(targetName, { encoding: 'utf-8' })}\n====\n${fs.readFileSync(ACTIVITY_LOG_FILE, { encoding: 'utf-8' })}`);
        fs.unlinkSync(ACTIVITY_LOG_FILE);
    }
    else {
        // Rotate
        fs.renameSync(ACTIVITY_LOG_FILE, targetName);
    }
}
// 

global.log = winston.createLogger({
    transports: [
        new (winston.transports.Console)({
            level: "debug",
            handleExceptions: true,
            json: false,
            colorize: true,
            timestamp: true,
            format: format.combine(
                winston.format.timestamp({
                    format: 'YYYY-MM-DD hh:mm:ss'
                }), winston.format.cli(),
                winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}` + (info.splat !== undefined ? `${info.splat}` : " "))
            )
        }),
        new (winston.transports.File)({
            filename: ACTIVITY_LOG_FILE,
            level: 'debug',
            format: winston.format.combine(
                winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss'
                }),
                winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}` + (info.splat !== undefined ? `${info.splat}` : " "))
            )
        }),
        new (winston.transports.File)({
            filename: 'logs/error.log',
            level: 'warning',
            format: winston.format.combine(
                winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss'
                }),
                winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}` + (info.splat !== undefined ? `${info.splat}` : " "))
            )
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

run();