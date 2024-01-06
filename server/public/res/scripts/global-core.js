
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

let NEW_PLAYER = false;


// global core
globalCore.cells = [];
globalCore.buffer = null;
globalCore.coreName = "The assembly";
globalCore.coreId = 0;
globalCore.ready = false;

globalCore.scoreboardDisplays = {};
globalCore.scoreboardParent = null;

globalCore.podiumColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
globalCore.highestScoresParent = null;
globalCore.highestScoresDisplays = {};

globalCore.onWindowLoad = function () {
    globalCore.bindButtons();

    globalCore.createGlobalCoreDisplay(5, 256);
    globalCore.buffer = new Int16Array(5 * 256);
    globalCore.refreshGlobalCore({});
    globalCore.displayScoreboard([], {});

    globalCore.scoreboardParent = document.getElementById("scoreboard-entries");
    globalCore.highestScoresParent = document.getElementById("highest-scores");

    globalCore.coreNameDiv = document.getElementById("core-name-container");
    globalCore.initializeSocket();
    globalCore.ready = true;

    if (globalCore.ready && interactive.ready && !serverCom.connected) {
        serverCom.connected = true;
        socket.connect();
    }
}

globalCore.createGlobalCoreDisplay = function (columns, size) {
    if (globalCore.cells.length != columns * size) {
        globalCore.cells.length = 0;
        const parent = document.getElementById("global-core-grid-container");
        parent.className = null;
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
        document.getElementById("credits").style.display = "none";

        inputs[0].focus();
        interactive.refreshLine(0);
    };
}

globalCore.displayScoreboard = function (scoreboard, activity, podium = false) {
    let coreDom = document.getElementById("global-core");

    if (podium) {
        entriesParent = globalCore.highestScoresParent;
        displays = globalCore.highestScoresDisplays;

        if (Object.keys(displays).length == 0 && scoreboard.length != 0) {
            const title = document.createElement("div");
            title.className = "score-header";
            title.textContent = "MOST HITS";
            entriesParent.appendChild(title);
        }
    }
    else {
        entriesParent = globalCore.scoreboardParent;
        displays = globalCore.scoreboardDisplays;

        if (Object.keys(displays).length == 0 && scoreboard.length != 0) {
            const title = document.createElement("div");
            title.className = "score-header";
            title.textContent = "ACTIVE DELEGATES";
            entriesParent.appendChild(title);
        }
    }

    if (!podium) {
        if (globalCore.scoreboard &&
            (!coreDom.style || Object.keys(coreDom.style).length == 0) &&
            Object.keys(globalCore.scoreboard).length > scoreboard.length) {
            // someone died
            sound.playBoom();
        }
    }

    const seenIds = [];
    for (const k in scoreboard) {
        const id = podium ? `${scoreboard[k].name}@${scoreboard[k].ownerId}` : scoreboard[k].id;

        const scoreDisplay = displays[id] ?? {
            entryDiv: document.createElement("div"),
            textDiv: document.createElement("div"),
            button: null
        };

        seenIds.push(id);

        if (!displays[id]) {
            scoreDisplay.entryDiv.appendChild(scoreDisplay.textDiv);
        }

        const isBystander = !podium && activity[id].isBystander;

        scoreDisplay.textDiv.className = "score-name";
        scoreDisplay.textDiv.textContent = scoreboard[k].name + (isBystander ? "" : ` (${scoreboard[k].kills} hits)`);

        // Pick color
        let color;
        if (podium) {
            color = k >= globalCore.podiumColors.length ? globalCore.colors[0] : globalCore.podiumColors[k];
        }
        else {
            color = isBystander ?
                globalCore.colors[0] :
                globalCore.colors[((id - 1) % (globalCore.colors.length - 1) + 1)];
        }

        // Display color
        if (globalCore.wc_hex_is_light(color)) {
            scoreDisplay.textDiv.style.color = color;
            scoreDisplay.textDiv.style.background = "";
        }
        else {
            scoreDisplay.textDiv.style.color = "black";
            scoreDisplay.textDiv.style.background = color;
        }

        if (!displays[id] || podium) {
            entriesParent.appendChild(scoreDisplay.entryDiv);
            displays[id] = scoreDisplay;
        }
    }

    // Deletes the ones I have not seen
    for (const id in displays) {
        const scoreDisplay = displays[id];
        if (!seenIds.includes(podium ? id : parseInt(id))) {
            if (scoreDisplay.button) {
                if (scoreDisplay.button.parentNode) {
                    scoreDisplay.button.parentNode.removeChild(scoreDisplay.button);
                }
            }

            if (entriesParent) {
                entriesParent.removeChild(scoreDisplay.entryDiv);
            }

            delete displays[id];
        }
    }


    // Buttons
    if (!podium) {
        for (const k in seenIds) {
            const id = seenIds[k];
            const scoreDisplay = displays[id];

            if (activity[id].isYours) {
                const killButton = scoreDisplay.button ?? document.createElement("button");

                killButton.className = "kill-button";
                killButton.textContent = "❌";
                killButton.onclick = function () {
                    if (socket && ready) {
                        socket.emit("requestKill", id);
                    }
                }

                if (!scoreDisplay.button) {
                    scoreDisplay.button = killButton;
                    scoreDisplay.entryDiv.appendChild(killButton);
                }
            }
            else if (scoreDisplay.button) {
                if (scoreDisplay.button.parentNode) {
                    scoreDisplay.button.parentNode.removeChild(scoreDisplay.button);
                }

                scoreDisplay.button = null;
            }
        }
    }
}

globalCore.refreshActivity = function (activity) {
    for (const programId in activity) {
        const scoreDisplay = globalCore.scoreboardDisplays[programId];
        if (scoreDisplay) {
            let name = scoreDisplay.textDiv.className;
            name = name.replace("plays-next", "");
            if (activity[programId].executesNext) {
                name += " plays-next";
            }

            scoreDisplay.textDiv.className = name;
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

globalCore.updateCoreName = function (coreInfo) {
    globalCore.coreNameDiv.innerHTML = "";
    globalCore.coreId = coreInfo.id;
    if (coreInfo.availableCores.length <= 1) {
        const h1 = document.createElement("h1");
        h1.id = "core-name";
        h1.textContent = `ASSEMBLY #${coreInfo.id + 1} [${coreInfo.friendlyName}]`;
        globalCore.coreName = h1.textContent;
        globalCore.coreNameDiv.appendChild(h1);
    }
    else {
        const select = document.createElement("select");
        select.id = "core-name";
        const cores = coreInfo.availableCores.sort((a, b) => (a.id == coreInfo.id) - (b.id == coreInfo.id));
        for (const k in cores) {
            const info = coreInfo.availableCores[k];
            const option = document.createElement("option");
            option.textContent = `ASSEMBLY #${info.id + 1} [${info.friendlyName}]`;
            option.value = info.id;

            if (info.id == coreInfo.id) {
                globalCore.coreName = option.textContent;
                option.selected = "selected";
            }

            select.appendChild(option);
        }

        select.onchange = function () { globalCore.onCoreSelected(select); };

        globalCore.coreNameDiv.appendChild(select);
    }
}

globalCore.onCoreSelected = function (dom) {
    const coreId = dom.value;

    if (coreId != globalCore.coreId) {
        socket.emit("switchCore", coreId);
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
        globalCore.displayScoreboard(obj.highestScores, null, true);
        globalCore.refreshActivity(obj.activity);

        globalCore.updateCoreName(obj.coreInfo);
    });

    socket.on("highestScores", function (highestScores) {
        globalCore.displayScoreboard(highestScores, null, true);
    });

    socket.on("deltaCore", function (delta, scoreboard, activity) {
        globalCore.applyDelta(delta);

        if (scoreboard.length != globalCore.scoreboardDisplays.length) {
            globalCore.displayScoreboard(scoreboard, activity);
        }

        globalCore.refreshGlobalCore(activity);
        globalCore.refreshActivity(activity);
    });

    // Initially displayed
    // Note: this message may be doubled
    socket.on("hello", function (returning) {
        console.log(`Received HELLO ${returning}`);
        if (returning) {
            document.getElementById("global-core").style = {};
        }
        else {
            if (document.getElementById("code-editor").style?.display !== "none") {
                // User already in editor, probably the serveur restarted
            }
            else {
                NEW_PLAYER = true;
                document.getElementById("global-core").style.display = "none";
                document.getElementById("code-editor").style.display = "none";
                document.getElementById("intro").style = {};
            }
        }
    });

    socket.on("disconnect", () => {
        const txt = document.getElementById("global-core-grid-container");

        if (txt) {
            globalCore.cells.length = 0;
            txt.className += " error";
            txt.innerHTML = "<p>The remote assembly server closed the connection - probably because it is full and cannot accept new clients at the time.</p><p>Come back later ♥</p>";
        }

        // document.getElementById("global-core").style.display = "none";
        // document.getElementById("code-editor").style.display = "none";
        // document.getElementById("intro").style = {};
    });
}


// https://stackoverflow.com/questions/12043187/how-to-check-if-hex-color-is-too-black
globalCore.wc_hex_is_light = function (color) {
    const hex = color.replace('#', '');
    const c_r = parseInt(hex.substring(0, 0 + 2), 16);
    const c_g = parseInt(hex.substring(2, 2 + 2), 16);
    const c_b = parseInt(hex.substring(4, 4 + 2), 16);
    const brightness = ((c_r * 299) + (c_g * 587) + (c_b * 114)) / 1000;
    return brightness > 70;
}