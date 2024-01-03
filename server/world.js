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

class CoreInfo {
    core = null; // GlobalCore
    clients = [];
    id = 0;

    constructor(id)
    {
        this.core = new GlobalCore();
        this.clients = [];
        this.id = id;

        log.info(`Created core ${id} (${this.friendlyName})`);
    }

    get isFull()
    {
        this.clients = this.clients.filter(o=>o && !o.isDead);
        return this.clients.length 
    }

    get friendlyName()
    {
        return NAMES[this.id%NAMES.length] + (this.id >= NAMES.length ? `_${this.id}` : '');
    }
}

const cores = [];

module.exports = {
    getCoreIdForClient: function(clientIdString)
    {
        let coreId = -1;
        for(let k in cores)
        {
            if (!cores[k].isFull)
            {
                coreId = k;
                break;
            }
        }

        if (coreId < 0)
        {
            coreId = cores.length;
            cores.push(new CoreInfo(coreId));
        }

        return coreId;
    },

    getAvailableCores: function(){ 
        let availableCores = [];
        for(let k in cores)
        {
            availableCores.push({
                friendlyName: cores[k].friendlyName,
                id:cores[k].id,
                programCount: cores[k].core.programCount
            });
        }

        return availableCores;
    },
    maxCore: function(){return cores.length;},
    getCore: function(i){
        const c = cores[i].core;
        c.id = cores[i].id;
        c.friendlyName = cores[i].friendlyName;
        return c;
    }
}