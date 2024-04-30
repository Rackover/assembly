const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATABASE_DIRECTORY = "./statistics";
const BYSTANDER_KEY = "bystander";

// Map of <program unique key, ProgramStatistics>
const activePrograms = {};

module.exports = {
    terminate: terminate,
    register: notifyProgramBorn,
    leaderboards: require('./leaderboards'),

    DATABASE_DIRECTORY: DATABASE_DIRECTORY
};

class ProgramKill {
    targetKey;
    time;
    isBystanderKill;

    constructor(targetKey, time) {
        this.time = time;
        this.isBystanderKill = targetKey === BYSTANDER_KEY;
        this.targetKey = targetKey;
    }
}

class ProgramStatistics {
    #checksum;
    #presence = 0; // Live counter, do not serialize

    cyclesLived = 0;
    hitCount = 0;

    submissionCount = 0;
    deathCount = 0;

    knownUsers = {}; // Hashset of strings
    knownAuthors = {};
    knownNames = {};
    descriptions = {};

    kills = []; // Array of programKills

    firstSeen;

    // those will spam, keep them at the end
    cellsWritten = {};
    cellsRead = {};

    get uniqueKey() {
        return this.#checksum;
    }

    get checksum() {
        return this.#checksum;
    }

    // Program code is a buffer here
    constructor(programName, programCode, authorId, metadata) {
        this.firstSeen = Date.now();

        this.knownUsers[authorId] = true;
        this.knownNames[programName] = true;
        
        if (metadata)
        {
            if (metadata.author)
            {
                this.knownAuthors[metadata.author] = true;
            }

            if (metadata.description)
            {
                this.descriptions[metadata.description] = true;
            }
        }

        this.#checksum = crypto
            .createHash('md5')
            .update(programCode, 'utf8')
            .digest('hex');
    }

    incrementPresence() {
        this.#presence++;
    }

    decrementPresence() {
        this.#presence--;
    }

    get presence() {
        return this.#presence;
    }

    stringify() {
        let { ...result } = this;
        result.checksum = this.checksum;

        return JSON.stringify(result, null, "\t");
    }

    parse(str) {
        const obj = JSON.parse(str);

        const keys = Object.keys(this);

        for(const i in keys)
        {
            const member = keys[i];
            
            if (member === "firstSeen")
            {
                continue; // Never update this one
            }

            const val = obj[member];
            if (val)
            {
                if (Array.isArray(val))
                {
                    this[member] = [...this[member], ...val];
                }
                else if (typeof val === 'object')
                {
                    this[member] = { ...this[member], ...val};
                }
                else
                {
                    this[member] = val;
                }
            }
        }

        this.#checksum = obj.checksum;

        // sanitize
        if (!Array.isArray(this.kills))
        {
            this.kills = [];
        }
    }
}

function getFilePathForKey(key)
{
    const p = path.join(DATABASE_DIRECTORY, `${key}.json`);
    return p;
}

function terminate()
{
    flush();
}

function flush(key = false) {
    const programsToWrite = [];

    if (key === false) {
        // Flush everything
        programsToWrite.push(...Object.values(activePrograms));
    }
    else {
        programsToWrite.push(activePrograms[key]);
    }

    for (const i in programsToWrite) {
        try {
            fs.mkdirSync(DATABASE_DIRECTORY, {recursive: true});
            fs.writeFileSync(getFilePathForKey(programsToWrite[i].uniqueKey), programsToWrite[i].stringify());
        }
        catch (e) {
            log.error(`Could not flush statistics for program ${programsToWrite[i].uniqueKey}! ${e}`);
        }
    }
}

function notifyKilledProgram(key, killedKey) {
    if (activePrograms[key]) {
        activePrograms[key].kills.push(
            new ProgramKill(
                killedKey,
                Date.now()
            )
        );
    }
    else {
        log.warn(`Statistics were notified that program with key ${key} made a kill but they had never heard about it!`);
    }
}

function notifyProgramDied(key) {
    if (activePrograms[key]) {
        activePrograms[key].decrementPresence();
        activePrograms[key].deathCount++;

        log.debug(`Program ${key} presence is now ${activePrograms[key].presence}`);

        if (activePrograms[key].presence <= 0) {
            if (activePrograms[key] < 0) {
                log.warn(`Invalid/Weird program presence of ${activePrograms[key].presence} for program ${key}! Handling anyway but.... i don't like it!`);
            }

            log.info(`Removing program ${key} from statistics (not present anymore)`);

            flush(key);
            delete activePrograms[key];
        }
    }
    else {
        log.warn(`Statistics were notified that program with key ${key} died but they had never heard about it!`);
    }
}


function notifyCycleLived(key) {
    if (activePrograms[key]) {
        activePrograms[key].cyclesLived++;
    }
    else {
        log.warn(`Statistics were notified that program with key ${key} lived a cycle but they had never heard about it!`);
    }
}

function notifyCellWritten(key, addressRelativeToStart) {
    if (activePrograms[key]) {
        if (activePrograms[key].cellsWritten[addressRelativeToStart] == undefined)
        {
            activePrograms[key].cellsWritten[addressRelativeToStart] = 0;
        }
        
        activePrograms[key].cellsWritten[addressRelativeToStart]++;
    }
    else {
        log.warn(`Statistics were notified that program with key ${key} wrote a cell but they had never heard about it!`);
    }
}

function notifyCellRead(key, addressRelativeToStart) {
    if (activePrograms[key]) {
        if (activePrograms[key].cellsRead[addressRelativeToStart] == undefined)
        {
            activePrograms[key].cellsRead[addressRelativeToStart] = 0;
        }
        
        activePrograms[key].cellsRead[addressRelativeToStart]++;
    }
    else {
        log.warn(`Statistics were notified that program with key ${key} read a cell but they had never heard about it!`);
    }
}

function notifyForeignExecution(key) {
    if (activePrograms[key]) {
        activePrograms[key].hitCount++;
    }
    else {
        log.warn(`Statistics were notified that program with key ${key} triggered a foreign execution but they had never heard about it!`);
    }
}

function notifyProgramBorn(programName, programCode, authorId, meta) {
    let stats = new ProgramStatistics(programName, programCode, authorId, meta);

    const key = stats.uniqueKey;

    if (activePrograms[key]) {
        // All good!
        // Someone just registered a program that was already running. Maybe from another core.
        stats = activePrograms[key];
    }
    else {
        const p = getFilePathForKey(key);
        if (fs.existsSync(p)) {
            try {
                const str = fs.readFileSync(p, 'utf8');

                try {
                    stats.parse(str);
                }
                catch (e) {
                    log.warn(`An error occured while deserializing an existing stats entry for program key ${key}`);
                    console.log(e);
                    log.error(e);
                    return false;
                }
            }
            catch (e) {
                log.warn(`An error occured while reading an existing stats entry for program key ${key}`);
                log.error(e);
                return false;
            }
        }
        else {
            // It's a new program!
        }

        activePrograms[key] = stats;
    }

    stats.incrementPresence();
    log.debug(`Program ${key} presence is now ${activePrograms[key].presence}`);

    stats.submissionCount++;

    stats.knownUsers[authorId] = true;

    // Return API
    return {
        getKey: function(){
            return key;
        },
        notifyKilledOtherPlayerProgram: function (otherKey) {
            notifyKilledProgram(key, otherKey);
        },
        notifyKilledBystander: function () {
            notifyKilledProgram(key, BYSTANDER_KEY);
        },
        notifyKilledSelf: function () {
            notifyKilledProgram(key, key);
        },
        // Destructor
        notifyProgramDied: function () {
            notifyProgramDied(key);
        },
        notifyInstructionExecutedByForeignProgram: function () {
            notifyForeignExecution(key);
        },
        notifyCellRead: function (index) {
            notifyCellRead(key, index);
        },
        notifyCellWritten: function (index) {
            notifyCellWritten(key, index);
        },
        notifyCycleLived: function () {
            notifyCycleLived(key);
        }
    };
}

setInterval(flush, 5000);