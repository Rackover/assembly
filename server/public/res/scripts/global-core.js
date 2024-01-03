
globalCore.colors = [
    '#808080', // Gray
    '#e6194B',
    '#3cb44b',
    '#ffe119',
    '#4363d8',
    '#f58231',
    '#911eb4',
    '#42d4f4',
    '#f032e6',
    '#bfef45',
    '#fabed4',
    '#469990',
    '#dcbeff',
    '#9A6324',
    '#fffac8',
    '#800000',
    '#aaffc3',
    '#808000',
    '#ffd8b1',
    '#000075',
    '#a9a9a9'
];


// global core
globalCore.cells = [];
globalCore.buffer = null;
globalCore.scoreboard = {};

globalCore.onWindowLoad = function () {
    globalCore.bindButtons();

    globalCore.createGlobalCoreDisplay(5, 256);
    globalCore.buffer = new Int16Array(5 * 256);
    globalCore.refreshGlobalCore({});
    globalCore.displayScoreboard([], {});

    globalCore.initializeSocket();
}

globalCore.createGlobalCoreDisplay = function (columns, size) {
    if (globalCore.cells.length != columns * size) {
        globalCore.cells.length = 0;
        const parent = document.getElementById("global-core-grid-container");
        parent.innerHTML = "";

        globalCore.cells.length = 0;

        for (let columnIndex = 0; columnIndex < columns; columnIndex++) {
            const column = document.createElement("div");
            column.className = "global-core-grid";
            for (let i = 0; i < size; i++) {

                const cell = document.createElement("div");
                cell.className = "cell";

                const memoryAddress = i + columnIndex * size;

                globalCore.cells[memoryAddress] = cell;

                column.appendChild(cell);
            }

            parent.appendChild(column);
        }
    }
}

globalCore.bindButtons = function () {
    globalCore.makeProgramButton = document.getElementById("create-program-button");

    globalCore.makeProgramButton.onclick = function () {
        document.getElementById("code-editor").style = {};
        document.getElementById("global-core").style.display = "none";

        inputs[0].focus();
        interactive.refreshLine(0);
    };
}

globalCore.displayScoreboard = function (scoreboard, activity) {
    const entriesParent = document.getElementById("scoreboard-entries");
    let coreDom = document.getElementById("global-core");

    if (globalCore.scoreboard &&
        (!coreDom.style || Object.keys(coreDom.style).length == 0) &&
        Object.keys(globalCore.scoreboard).length > scoreboard.length) {
        // someone died
        sound.playBoom();
    }

    entriesParent.innerHTML = [];
    globalCore.scoreboard = {};

    for (const k in scoreboard) {
        const scoreEntry = document.createElement("div");

        const id = scoreboard[k].id;
        scoreEntry.textContent = scoreboard[k].name + (activity[id].isBystander ? "" : ` (${scoreboard[k].kills} hits)`);
       
        const color = activity[id].isBystander ? globalCore.colors[0] : globalCore.colors[((id - 1) % (globalCore.colors.length - 1) + 1)];
        
        if (globalCore.wc_hex_is_light(color))
        {
            scoreEntry.style.color = color;
            scoreEntry.style.background = "";
        }
        else{
            scoreEntry.style.color = "black";
            scoreEntry.style.background = color;
        }

        entriesParent.appendChild(scoreEntry);
        globalCore.scoreboard[id] = scoreEntry;
    }
}

globalCore.refreshActivity = function (activity) {
    for (const programId in activity) {
        if (globalCore.scoreboard[programId]) {
            let name = globalCore.scoreboard[programId].className;
            name = name.replace("plays-next", "");
            if (activity[programId].executesNext) {
                name += " plays-next";
            }

            globalCore.scoreboard[programId].className = name;
        }
    }

}

globalCore.applyDelta = function (delta) {
    for (const address in delta) {
        globalCore.buffer[address] = delta[address];
    }
}


globalCore.refreshGlobalCore = function (activity) {
    if (globalCore.cells.length != globalCore.buffer.length) {
        console.log("Expected %d cells but only got %d", globalCore.buffer.length, globalCore.cells.length);
        return;
    }

    const addressesOwners = {};
    for (const owner in activity) {
        // Reverse map
        addressesOwners[activity[owner].address] = activity[owner].isBystander ? 0 : owner;
    }

    for (let addr = 0; addr < globalCore.buffer.length; addr++) {
        const value = globalCore.buffer[addr];

        const op = value % ((1 << 4) - 1);

        const writer = (value >> 4) & ((1 << 5) - 1);
        const reader = addressesOwners[addr] == undefined ? 0 : addressesOwners[addr];
        const active = (value & (1 << 9)) != 0;

        if (active && reader) {
            sound.playBop((reader / 32) * 0.4 + 0.8);
        }

        const color = globalCore.colors[((writer - 1) % (globalCore.colors.length - 1) + 1)];
        const backgroundColor = globalCore.colors[((reader - 1) % (globalCore.colors.length - 1) + 1)];

        globalCore.cells[addr].style.borderColor = color;
        globalCore.cells[addr].style.borderStyle = op == module.exports.OPERATIONS.DATA ? "dotted" : "solid";
        globalCore.cells[addr].style.background = active ? `${backgroundColor} content-box` : ``;
    }
}

globalCore.initializeSocket = function () {
    socket.on("updateScoreboard", function (scoreboard, activity) {
        globalCore.displayScoreboard(scoreboard, activity);
        globalCore.refreshActivity(activity);
    });

    socket.on("initialCore", function (obj) {
        globalCore.createGlobalCoreDisplay(obj.columnCount, obj.columnSize);
        globalCore.buffer = new Int16Array(obj.data, 0, obj.columnCount * obj.columnSize);
        globalCore.refreshGlobalCore(obj.activity);
        globalCore.displayScoreboard(obj.scores, obj.activity);
        globalCore.refreshActivity(obj.activity);

        document.getElementById("core-name").textContent = `ASSEMBLY #${obj.coreInfo.id + 1} [${obj.coreInfo.friendlyName}]`;

    });

    socket.on("deltaCore", function (delta, scoreboard, activity) {
        globalCore.applyDelta(delta);

        if (scoreboard.length != globalCore.scoreboard.length) {
            globalCore.displayScoreboard(scoreboard, activity);
        }

        globalCore.refreshGlobalCore(activity);
        globalCore.refreshActivity(activity);
    });

    // Initially displayed
    // Note: this message may be doubled
    socket.on("hello", function(returning){
        if (returning)
        {
            document.getElementById("global-core").style = {};
        }
        else
        {
            document.getElementById("intro").style = {};
        }
    });
}


// https://stackoverflow.com/questions/12043187/how-to-check-if-hex-color-is-too-black
globalCore.wc_hex_is_light = function(color) {
    const hex = color.replace('#', '');
    const c_r = parseInt(hex.substring(0, 0 + 2), 16);
    const c_g = parseInt(hex.substring(2, 2 + 2), 16);
    const c_b = parseInt(hex.substring(4, 4 + 2), 16);
    const brightness = ((c_r * 299) + (c_g * 587) + (c_b * 114)) / 1000;
    return brightness > 70;
}