const GlobalCore = require("./global_core");

const NAMES = [
    "AMAROK",
    "BECK",
    "COCOON",
    "DECIBEL",
    "ELEMENT",
    "FJORD",
    "GIST",
];

const HIGH_SCOREBOARD_LENGTH = 10;


class CoreInfo {
    core = null; // GlobalCore
    clients = [];
    id = 0;

    constructor(id) {
        this.core = new GlobalCore();
        this.clients = [];
        this.id = id;

        log.info(`Created core ${id} (${this.friendlyName})`);
    }

    trim() {
        this.clients = this.clients.filter(o => o && !o.isDead);
    }

    get isFull() {
        return this.core.programCount >= CONFIG.MAX_PROGRAMS;
    }
    created
    get isDesirable() {
        return this.core.programCount < 8;
    }

    get isEmpty() {
        return this.clients.length <= 0;
    }

    get friendlyName() {
        return NAMES[this.id % NAMES.length] + (this.id >= NAMES.length ? `_${this.id}` : '');
    }
}

const cores = [];
let highestScoresEver = [];
const knownUsers = {};

module.exports = {
    loadHighscores: function (hs) { highestScoresEver = hs; },
    getHighscores: function () { return [...highestScoresEver]; },

    loadUserList: function (ul) { 
        for(const k in ul)
        {
            knownUsers[k] = ul[k];
        }

     },
    getUserList: function () { return knownUsers; },

    pushScores: refreshHighestScores,
    trimCores: trimCores,
    getClientCount: getClientCount,
    nameCheckAllCores: function () {
        for (let k in cores) {
            cores[k].core.performNameCheck();
        }
    },
    forgetClient: function (client) {
        for (let k in cores) {
            cores[k].clients = cores[k].clients.filter(o => o != client);
        }
    },
    registerClient: function (client, coreID) {
        const core = getCoreInfo(coreID);
        if (core === false) {
            log.err(`Could not register client ${client} on core ID ${coreID} ???`);
            return false;
        }

        log.info(`Registered client ${client} in core ID ${coreID}`);
        core.clients.push(client);
        return true;
    },
    getCoreIdForClient: function (clientIdString) {
        trimCores();

        let coreID = -1;
        let nonFullCore = -1;
        for (let k in cores) {
            if (cores[k].isDesirable) {
                coreID = k;
                nonFullCore = k;
                log.info(`Core ${coreID} is desirable for client ${clientIdString}, putting them here`);
                break;
            }
            else if (!cores[k].isFull) {
                nonFullCore = k;
            }
        }

        if (coreID < 0) {
            if (cores.length >= CONFIG.MAX_CORES) {
                if (nonFullCore < 0) {
                    log.warn(`Cannot create any new cores (hit config limit ${CONFIG.MAX_CORES}), refusing client :(`);
                    return false;
                }
                else {
                    log.info(`Core ${nonFullCore} is not desirable but it's not full, putting client ${clientIdString} there`)
                    return nonFullCore;
                }
            }

            coreID = cores.length;
            log.info(`Created new core ${coreID} for client ${clientIdString}`);

            cores.push(new CoreInfo(coreID));
        }

        return coreID;
    },

    getAvailableCores: function () {
        let availableCores = [];
        for (let k in cores) {
            availableCores.push({
                friendlyName: cores[k].friendlyName,
                id: cores[k].id,
                programCount: cores[k].core.programCount
            });
        }

        return availableCores;
    },
    coreCount: function () { return cores.length; },
    getCore: function (id) {
        const info = getCoreInfo(id);
        if (info === false) {
            return false;
        }

        const c = info.core;
        c.id = info.id;
        c.friendlyName = info.friendlyName;

        return c;
    }
}

function getCoreInfo(id) {
    for (const k in cores) {
        if (cores[k].id == id) {
            return cores[k];
        }
    }

    return false;
}

function trimCores() {
    const toKill = [];
    if (cores.length <= 1) {
        return; // Never trim first core?
    }

    for (let k = cores.length - 1; k > 0; k--) {  // Never trim first core
        if (cores[k]) {
            if (cores[k].isEmpty) {
                log.info(`Core ${cores[k].id} was empty and got trimmed!`);
                toKill.push(k);
            }
        }
        else
        {
            log.error(`Invalid tried to trim core index ${k} ?? out of ${cores.length} cores. ${cores[k]}`);
        }
    }

    for (const i in toKill) {
        cores.splice(i, 1);
    }
}

function getClientCount() {
    let clientCount = 0;
    for (let k in cores) {
        clientCount += cores[k].clients.filter(o => !o.isDead).length;
    }

    return clientCount;
}

function refreshHighestScores(scores) {
    let changed = false;
    const previousLast = highestScoresEver.length == 0 ?
        false :
        highestScoresEver[highestScoresEver.length - 1];

    for (const i in scores) {
        if (scores[i].ownerId <= 0) continue; // bystander?

        const scoreId = `${scores[i].name}@${scores[i].ownerId}`;
        let exists = false;

        for (const k in highestScoresEver) {
            const entry = highestScoresEver[k];
            const entryId = `${entry.name}@${entry.ownerId}`;
            // Check if exists

            if (scoreId == entryId) {
                if (entry.kills < scores[i].kills) {
                    log.info(`Highscore for ${entry.name}: ${entry.kills} => ${scores[i].kills}`);
                    entry.kills = scores[i].kills;
                    changed = true;
                }

                exists = true;
                break;
            }
        }

        if (!exists) {
            highestScoresEver.push({
                name: scores[i].name,
                ownerId: scores[i].ownerId,
                kills: scores[i].kills
            });

            log.info(`Pushed a new highscore on the list (${scores[i].name}) because it did not exist yet`);
        }

        highestScoresEver.sort((a, b) => { return b.kills - a.kills; });
        highestScoresEver = highestScoresEver.splice(0, HIGH_SCOREBOARD_LENGTH);

        changed |= previousLast != highestScoresEver[highestScoresEver.length - 1];
    }

    return changed;
}
