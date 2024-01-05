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

const MAX_CLIENTS_PER_CORE = 10;

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
        return this.clients.length >= MAX_CLIENTS_PER_CORE || this.core.programCount >= CONFIG.MAX_PROGRAMS;
    }

    get isDesirable() {
        return this.clients.length < MAX_CLIENTS_PER_CORE * 0.5 && this.core.programCount < 8;
    }

    get isEmpty() {
        return this.clients.length <= 0;
    }

    get friendlyName() {
        return NAMES[this.id % NAMES.length] + (this.id >= NAMES.length ? `_${this.id}` : '');
    }
}

const cores = [];

module.exports = {
    trimCores: trimCores,
    nameCheckAllCores: function () {
        for (let k in cores) {
            cores[k].core.performNameCheck();
        }
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

            log.info(`Created new core ${coreID} for client ${clientIdString}`);

            coreID = cores.length;
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
    getCore: function (i) {
        for (const k in cores) {
            if (cores[k].id == i) {
                const c = cores[k].core;
                c.id = cores[k].id;
                c.friendlyName = cores[k].friendlyName;
                return c;
            }
        }

        return false;
    }
}

function trimCores() {
    const toKill = [];
    if (cores.length <= 1) {
        return; // Never trim first core?
    }

    for (let k in cores) {
        cores[k].trim();
        if (cores[k].isEmpty) {
            log.info(`Core ${cores[k].id} was empty and got trimmed!`);
            toKill.push(k);
        }
    }

    for (const i in toKill) {
        delete cores[i];
    }
}