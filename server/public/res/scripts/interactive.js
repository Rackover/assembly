const LINE_COUNT = 31;
const TRAINING_CORE_REQUIRED_LIFESPAN = 30;

let programNameInput;
const inputs = [];
const inputDisplays = [];
let ready = false;
let explanationsWindow;

let requestedSpeed = 2;

// parse results
const targetedLines = [];

const codeLineIndices = {};
const trimmedLines = {};

// buttons
const editorButtons = {};

// training core
const trainingCoreCells = [];
let lastTrainingBuffer;
let lastTrainingFlagsBuffer;
let trainingCoreIsRunning = false;
let trainedForCycles = 0;

let programIsEmpty = true;

interactive.onWindowLoad = function () {
    interactive.createEditor();
    interactive.bindButtons();
    interactive.createTrainingCoreDisplay(3, 32);

    explanationsWindow = document.getElementById("explanations");

    ready = true;

    // Select first
    inputs[0].focus();
    programNameInput.value = "my_program";

    // fetch("server/test_program.kcp")
    //     .then((res) => res.text())
    //     .then((text) => {
    //         // do something with "text"
    //         // loadProgram(text);
    //     })
    //     .catch((e) => console.error(e));

    interactive.initializeSocket();
}

interactive.loadProgram = function (name, str) {
    if (!ready) {
        return;
    }

    programNameInput.value = name;

    const lines = str.split('\n');
    for (let i = 0; i < LINE_COUNT; i++) {
        const input = document.getElementById(`input-${i}`);
        input.value = lines[i] ? lines[i] : "";
        interactive.refreshSyntaxDetectionOnLine(i);
    }

    inputs[0].focus();
    interactive.refreshButtons();
}

interactive.createTrainingCoreDisplay = function (columns, size) {
    if (trainingCoreCells.length != columns * size) {
        trainingCoreCells.length = 0;
        const parent = document.getElementById("core-training");
        parent.innerHTML = "";

        const height = size;
        trainingCoreCells.length = 0;

        for (let x = 0; x < columns; x++) {

            const row = document.createElement("div");
            row.className = "row";
            for (let y = 0; y < height; y++) {

                const memoryAddress =
                    x * height
                    + y;

                const cell = document.createElement("div");
                cell.className = "cell";

                if (x == Math.floor(columns / 2)) {
                    if (y == Math.floor(height / 2)) {
                        cell.textContent = "[ CORE ]"
                    }
                    else if (y == Math.floor(height / 2) + 1) {
                        cell.textContent = "[ IDLE ]"
                    }
                }


                if (cell.textContent.length == 0) {
                    cell.className += " idle";
                    cell.textContent = "--------";
                }

                trainingCoreCells[memoryAddress] = cell;

                row.appendChild(cell);
            }

            parent.appendChild(row);
        }
    }
}

interactive.updateTrainingCoreDisplayFromFullBuffer = function (obj) {
    lastTrainingBuffer = obj.data;//Int32Array
    lastTrainingFlagsBuffer = obj.flags;

    if (lastTrainingBuffer.length != trainingCoreCells.length) {
        console.log("Unexpected buffer length, got %d instea of %d", buff.length, trainingCoreCells.length);
    }

    interactive.updateTrainingCoreDisplay(obj.nextAddress);
}

interactive.updateTrainingCoreDisplayFromDelta = function (obj) {
    for (let k in obj.delta) {
        lastTrainingBuffer[k] = obj.delta[k];
    }

    for (let k in obj.deltaFlags) {
        lastTrainingFlagsBuffer[k] = obj.deltaFlags[k];
    }

    interactive.updateTrainingCoreDisplay(obj.nextAddress);
}

interactive.updateTrainingCoreDisplay = function (nextAddress) {
    const lineLength = 8;

    const buff = lastTrainingBuffer;
    const flags = lastTrainingFlagsBuffer;

    for (let i = 0; i < buff.length; i++) {
        let txt = "--------";
        const value = buff[i];
        const op = (value >> module.exports.OPERATION_SHIFT) & module.exports.OPERATION_MASK;

        if (op > 0) {
            const operation = Object.keys(module.exports.OPERATIONS)[op];
            if (op == module.exports.OPERATIONS.NOOP) {
                txt = "--------";
            }
            else if (operation) {
                txt = operation.toUpperCase().substring(0, lineLength).padEnd(lineLength);
            }
            else {
                txt = `? unk ${op}`.padEnd(lineLength).substring(0, lineLength);
            }
        }
        else {
            txt = `DAT.${value.toString().padStart(lineLength - 4, '0')}`;

            if (value == 0) {
                trainingCoreCells[i].style.color = "gray";
            }
            else {
                trainingCoreCells[i].style.color = "white";
            }
        }

        const owner = flags[i];
        trainingCoreCells[i].textContent = txt;

        trainingCoreCells[i].style.backgroundColor = owner == 0 ? "" : "darkred";
        trainingCoreCells[i].style.backgroundColor = nextAddress == i ? "orange" : trainingCoreCells[i].style.backgroundColor;
    }
}

interactive.bindButtons = function () {

    editorButtons.trainingButton = document.getElementById("run-training-program");
    editorButtons.trainingButton.onclick = function () {
        if (socket) {
            socket.emit("testProgram", programNameInput.value, interactive.getProgramString(), 1);
        }
    };

    editorButtons.killTestCoreButton = document.getElementById("kill-test-core");
    editorButtons.killTestCoreButton.onclick = function () {
        if (socket) {
            socket.emit("stopTestingProgram");
        }
    };

    editorButtons.speedUpButton = document.getElementById("speed-up");
    editorButtons.speedUpButton.onclick = function () {
        if (socket) {
            requestedSpeed = Math.max(0, Math.min(++requestedSpeed, 5));
            socket.emit("setSpeed", requestedSpeed);
        }
    };

    editorButtons.speedDownButton = document.getElementById("speed-down");
    editorButtons.speedDownButton.onclick = function () {
        if (socket) {
            requestedSpeed = Math.max(0, Math.min(--requestedSpeed, 5));
            socket.emit("setSpeed", requestedSpeed);
        }
    };

    editorButtons.saveButton = document.getElementById("save-program");
    editorButtons.saveButton.onclick = function () {
        if (ready && !programIsEmpty) {
            interactive.download(
                interactive.getProgramString(),
                `${programNameInput.value.trim().toUpperCase()}.KCP`,
                'text/killcore-program');
        }
    };

    editorButtons.loadButton = document.getElementById("load-program");
    editorButtons.loadButton.onclick = function () {
        if (ready) {
            interactive.upload();
        }
    };

    editorButtons.sendToGlobalCoreButton = document.getElementById("send-to-core");
    editorButtons.sendToGlobalCoreButton.onclick = function () {
        if (ready) {
            console.log("uploading program...");
            socket.emit("uploadProgram", programNameInput.value, interactive.getProgramString());
        }
    };

    editorButtons.accessCoreButton = document.getElementById("access-core");
    editorButtons.accessCoreButton.onclick = function () {
        if (ready) {
            document.getElementById("code-editor").style.display = "none";
            document.getElementById("global-core").style = {};
        }
    };

    interactive.refreshButtons();
}

interactive.refreshEditorButtons = function () {
    editorButtons.saveButton.disabled = programIsEmpty;
    editorButtons.trainingButton.disabled = programIsEmpty;
}

interactive.refreshTrainingCoreButtons = function () {
    editorButtons.killTestCoreButton.disabled = !trainingCoreIsRunning;
    editorButtons.speedUpButton.disabled = !trainingCoreIsRunning;
    editorButtons.speedDownButton.disabled = !trainingCoreIsRunning;
    editorButtons.sendToGlobalCoreButton.disabled = !trainingCoreIsRunning || trainedForCycles < TRAINING_CORE_REQUIRED_LIFESPAN;

    editorButtons.sendToGlobalCoreButton.textContent = "SEND TO CORE >>";

    // Update send to core button
    if (trainingCoreIsRunning) {
        if (trainedForCycles < TRAINING_CORE_REQUIRED_LIFESPAN) {
            const remaining = TRAINING_CORE_REQUIRED_LIFESPAN - trainedForCycles;
            editorButtons.sendToGlobalCoreButton.textContent = `${remaining} cycles before approval`;
        }
    }
    else {
    }

}

interactive.refreshButtons = function () {
    interactive.refreshProgramIsEmpty();
    interactive.refreshTrainingCoreButtons();
    interactive.refreshEditorButtons();
}

interactive.refreshProgramIsEmpty = function () {
    programIsEmpty = true;
    for (let i = 0; i < LINE_COUNT; i++) {
        if (inputs[i].value.trim().length > 0) {
            programIsEmpty = false;
            break;
        }
    }
}

interactive.getProgramString = function () {
    let program = "";
    for (let i = 0; i < LINE_COUNT; i++) {
        const input = inputs[i];
        program += input.value.substring(0, 64) + "\n"; // Limit to 64 characters
    }

    return program;
}

interactive.createEditor = function () {

    programNameInput = document.getElementById("program-name");

    const parentColumn = document.getElementById("editor-column");
    parentColumn.innerHTML = "";

    for (let i = 0; i < LINE_COUNT; i++) {
        const row = document.createElement("div");
        row.className = "row";

        const addr = document.createElement("div");
        addr.id = `address-${i}`;
        addr.textContent = i.toString().padStart(8, '0');

        const inputWrapper = document.createElement("div");
        inputWrapper.className = "editor-line";

        const inputSpan = document.createElement("input");
        inputSpan.type = "text";
        inputSpan.id = `input-${i}`;
        inputSpan.onkeydown = interactive.onKeyPress;
        inputSpan.oninput = interactive.onKeyPress;
        inputSpan.onfocus = interactive.refreshSelectedLine;

        const inputDisplay = document.createElement("div");
        inputDisplay.className = "display";

        inputs.push(inputSpan);
        inputDisplays.push(inputDisplay);

        inputWrapper.appendChild(inputSpan);
        inputWrapper.appendChild(inputDisplay);

        row.appendChild(addr);
        row.appendChild(inputWrapper);

        parentColumn.appendChild(row);
    }
}

interactive.onKeyPress = function (e) {
    if (!ready) {
        return;
    }

    switch (e.key) {
        case "ArrowDown":
        case "Enter":
            interactive.focusNext(1);
            break;

        case "ArrowUp":
            interactive.focusNext(-1);
            break;

        case "Insert":
            interactive.insertNewLine();
            interactive.refreshButtons();
            break;
        case "Delete":
            {
                if (e.shiftKey) {
                    interactive.removeLine();
                    interactive.refreshButtons();
                }
            }
            break;

        default:
            interactive.refreshSelectedLine();
            interactive.refreshButtons();
            break;
    }
}

interactive.refreshSyntaxDetection = function () {
    const currInput = document.activeElement;
    const currInputIndex = inputs.indexOf(currInput);

    if (currInputIndex >= 0) {
        interactive.refreshSyntaxDetectionOnLine(currInputIndex);
    }
}

interactive.refreshSyntaxDetectionOnLine = function (index) {
    const parseResult = module.exports.tokenize(inputs[index].value);
    interactive.showParserResult(parseResult, index);
}

interactive.insertNewLine = function () {
    const currInput = document.activeElement;
    const currInputIndex = inputs.indexOf(currInput);

    if (currInputIndex >= 0) {
        for (let i = LINE_COUNT; i >= currInputIndex; i--) {
            inputs[i - 1].value = i == LINE_COUNT ? inputs[i].value : "";
            interactive.refreshLine(i - 1);
        }

        inputs[currInputIndex].value = "";
        interactive.refreshLine(currInputIndex);
    }
}

interactive.removeLine = function () {
    const currInput = document.activeElement;
    const currInputIndex = inputs.indexOf(currInput);

    if (currInputIndex >= 0) {
        for (let i = currInputIndex; i < LINE_COUNT - 1; i++) {
            inputs[i].value = inputs[i + 1].value;
            interactive.refreshLine(i);
        }

        inputs[LINE_COUNT - 1].value = "";
        interactive.refreshLine(LINE_COUNT - 1);
    }
}

interactive.focusNext = function (offset) {
    const currInput = document.activeElement;
    const currInputIndex = inputs.indexOf(currInput);
    let nextinputIndex =
        (currInputIndex + offset) % inputs.length;
    while (nextinputIndex < 0) {
        nextinputIndex = inputs.length + nextinputIndex;

    }

    const input = inputs[nextinputIndex];
    input.setSelectionRange(0, 0);
    input.focus();
}

interactive.refreshLine = function (i ) {
    if (i >= 0) {

        interactive.refreshCodeLines();
        interactive.refreshSyntaxDetectionOnLine(i);
        interactive.refreshInputForSelection(i);

        interactive.refreshTargetedLines();
    }
}

interactive.refreshSelectedLine = function () {
    const currInput = document.activeElement;
    const currInputIndex = inputs.indexOf(currInput);

    if (currInputIndex >= 0) {
        interactive.refreshLine(currInputIndex);
    }
}

interactive.refreshTargetedLines = function () {
    const currInput = document.activeElement;
    const currInputIndex = inputs.indexOf(currInput);

    if (currInputIndex >= 0) {

        // Clear everybody else
        for (let i in inputs) {

            const input = inputs[i];

            for (let argIndex = 0; argIndex < 2; argIndex++) {
                input.className = input.className.replace(`target-${argIndex}`, '');
            }
        }

        if (targetedLines.length > 0) {
            const currentCodeLine = codeLineIndices[currInputIndex];
            const reverseCodeLinesMap = {};
            for (let k in codeLineIndices) {
                reverseCodeLinesMap[codeLineIndices[k]] = k;
            }

            for (let i = 0; i < targetedLines.length; i++) {
                if (targetedLines[i] === null) {
                    continue;
                }

                const targetedLine = currentCodeLine + targetedLines[i];
                const inputIndex = reverseCodeLinesMap[targetedLine];

                if (inputIndex != undefined) {
                    const input = document.getElementById(`input-${inputIndex}`);
                    input.className += ` target-${i}`;
                }
            }
        }
    }
}

interactive.refreshCodeLines = function () {
    // Compute code line indices

    trimmedLines.length = 0;
    codeLineIndices.length = 0;

    let codeI = 0;
    for (let i = 0; i < inputs.length; i++) {
        const input = document.getElementById(`input-${i}`);
        const trimmedContents = input.value.trim();
        const lineIsEmpty = trimmedContents.length == 0;
        const lineIsComment = !lineIsEmpty && trimmedContents[0] == COMMENT;

        trimmedLines[i] = trimmedContents;

        if (lineIsComment) {
            continue;
        }

        codeI++;
        codeLineIndices[i] = codeI;
    }

    return codeLineIndices;
}

interactive.refreshInputForSelection = function (index) {
    const codeLineIndex = codeLineIndices[index];
    for (let i = 0; i < inputs.length; i++) {
        const addr = document.getElementById(`address-${i}`);

        const trimmedContents = trimmedLines[i];

        let lineIsCurrent = false;
        const lineIsEmpty = trimmedContents.length == 0;
        const lineIsComment = !lineIsEmpty && trimmedContents[0] == COMMENT;

        const classes = [];

        if (lineIsEmpty) {
            classes.push("empty-field");
            addr.textContent = "--------";
        } else if (lineIsComment) {
            classes.push("comment-field");
            addr.textContent = "#COMMENT";
        } else if (codeLineIndex == undefined) {
            addr.textContent = '-'.padStart(8, '-');
        }

        if (i == index) {
            addr.textContent = "CURRENT>";
            classes.push("current-field");
            lineIsCurrent = true;
        } else if (codeLineIndex != undefined && !lineIsComment) {
            const visualIndex = codeLineIndex - codeLineIndices[i];
            addr.textContent = `${(i > codeLineIndex ? "+" : "-")}${(Math.abs(visualIndex)).toString().padStart(7, '0')}`;
        }

        addr.className = "address-field " + classes.join(" ");
        inputDisplays[i].className = "display " + classes.join(" ");
    }
}

interactive.showParserResult = function (parseResult, index) {

    if (index == undefined) {
        const currInput = document.activeElement;
        index = inputs.indexOf(currInput);

    }

    targetedLines.length = 0; // clear

    if (index >= 0) {
        const display = inputDisplays[index];
        const val = inputs[index];

        if (parseResult.anyError) {
            const errorMessage = parseResult.tokens[0].errorMessage;
            explanationsWindow.innerHTML = `<p class='error'><b>This line contains an error!</b><br>${errorMessage}</p>`;
            display.innerHTML = `<span class='error'>${val.value}</span>`;
        } else {
            const tokens = parseResult.tokens;
            if (tokens.length > 0) {
                const token = tokens[0];

                if (token.isComment) {
                    explanationsWindow.innerHTML = "<p>This line is a comment and will not be executed.<br>It serves as documentation for you and whoever might read this program.</p>";
                    display.innerHTML = `<span class='comment'>${val.value}</span>`;
                } else {
                    explanationsWindow.textContent = "<TODO>";
                    for (let argIndex in token.arguments) {
                        const a = token.arguments[argIndex];

                        if (a.isReference || a.depth > 0) {
                            targetedLines.push(a.value);
                        }
                        else {
                            targetedLines.push(null);
                        }
                    }

                    val.value = interactive.fixSpacesInStatement(val.value);
                    display.innerHTML = interactive.getHTMLForToken(token);
                }
            } else {
                explanationsWindow.textContent = "You can write a statement here!";
                display.textContent = val.value;
            }
        }
    }
}

interactive.getHTMLForToken = function (token) {
    const elems = [];
    let minLength = token.operatorText.length;

    elems.push(`<span class="operator">${token.operatorText}</span>`);

    if (token.arguments && token.arguments.length > 0) {
        if (token.arguments[0].text) {
            elems.push(`<span class="argument-0">${token.arguments[0].text}</span>`);
            minLength += token.arguments[0].text.length + 1;
        }

        if (token.arguments.length > 1) {
            if (token.linkText) {
                elems.push(`<span class="link">${token.linkText}</span>`);
            }

            elems.push(`<span class="argument-1">${token.arguments[1].text}</span>`);
            minLength += token.arguments[1].text.length + 1;
        }
    }

    let final = elems.join(' ');

    if (token.remainingData.length > 0) {
        final += " <span class='unknown-statement'>" + token.remainingData + "</span>";
    }

    return final;
}

interactive.fixSpacesInStatement = function (str) {
    str = str.replace(/ +/g, ' ').trimStart();

    return str;
}

interactive.initializeSocket = function () {
    socket.on("programUploaded", function () {
        console.log("Program uploaded, back to core");
        editorButtons.accessCoreButton.click();
    });

    socket.on("testCore", function (obj) {
        trainingCoreIsRunning = !obj.error;
        if (trainingCoreIsRunning) {
            trainedForCycles++;
        }
        else {
            trainedForCycles = 0;
        }

        interactive.refreshTrainingCoreButtons();

        interactive.createTrainingCoreDisplay(obj.columnCount, obj.columnSize);

        if (obj.error) {
            explanationsWindow.innerHTML = `<p class="warn">Training core interrupted:</p><p class="error">${obj.error}</p>`;
        }
        else if (obj.delta) {
            interactive.updateTrainingCoreDisplayFromDelta(
                {
                    delta: obj.delta,
                    deltaFlags: obj.deltaFlags,
                    nextAddress: obj.nextAddress
                }
            );
        }
        else if (obj.data) {
            interactive.updateTrainingCoreDisplayFromFullBuffer(
                {
                    data: new Int32Array(obj.data, 0, obj.columnCount * obj.columnSize),
                    flags: new Uint8Array(obj.flags),
                    nextAddress: obj.nextAddress
                }
            );
        }
        else {
            // ??
        }
    });
}

interactive.download = function (data, filename, type) {
    var file = new Blob([data], { type: type });
    if (window.navigator.msSaveOrOpenBlob) // IE10+
        window.navigator.msSaveOrOpenBlob(file, filename);
    else { // Others
        var a = document.createElement("a"),
            url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
    }
}

interactive.upload = function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = ".KCP";

    input.onchange = e => {
        if (e.target.files && e.target.files.length > 0) {
            var file = e.target.files[0];

            // setting up the reader
            var reader = new FileReader();
            reader.readAsText(file, 'UTF-8');

            // here we tell the reader what to do when it's done reading...
            reader.onload = readerEvent => {
                var content = readerEvent.target.result; // this is the content!
                interactive.loadProgram(file.name.replace(".KCP", ""), content);
            }
        }
    }

    input.click();
    document.body.appendChild(input);

    setTimeout(function () {
        document.body.removeChild(input);
    }, 0);
}