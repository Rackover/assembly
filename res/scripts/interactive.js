
const LINE_COUNT = 32;

const inputs = [];
const inputDisplays = [];
let ready = false;
let explanationsWindow;

// parse results
const targetedLines = [];

const codeLineIndices = {};
const trimmedLines = {};
//

// training core
const trainingCoreCells = [];

window.onload = function () {
    createEditor();
    createTrainingCoreDisplay(32);

    explanationsWindow = document.getElementById("explanations");

    ready = true;

    fetch("server/test_program.kcp")
    .then((res) => res.text())
    .then((text) => {
        // do something with "text"
        loadProgram(text);
    })
    .catch((e) => console.error(e));
}

function loadProgram(str) {
    if (!ready) {
        return;
    }

    const lines = str.split('\n');
    for (let i = 0; i < LINE_COUNT; i++) {
        const input = document.getElementById(`input-${i}`);
        input.value = lines[i] ? lines[i] : "";
        refreshSyntaxDetectionOnLine(i);
    }

    inputs[0].focus();
}

function createTrainingCoreDisplay(size)
{
    const parent = document.getElementById("core-training");
    parent.innerHTML = "";

    const width = 3;
    const height = size;
    trainingCoreCells.length = 0;

    for (let x = 0; x < width; x++) {

        const row = document.createElement("div");
        row.className = "row";
        for (let y = 0; y < height; y++) {

            const memoryAddress =
                x * height
                + y;

            const cell = document.createElement("div");
            cell.className = "cell";

            if (x == Math.floor(width/2))
            {
                if (y == Math.floor(height/2))
                {
                    cell.textContent = "[ CORE ]"
                }
                else if (y == Math.floor(height/2) +1 )
                {
                    cell.textContent = "[ IDLE ]"
                }
            }
            
            
            if (cell.textContent.length == 0)
            {
                cell.className += " idle";
                cell.textContent = "--------";
            }

            trainingCoreCells[memoryAddress] = cell;

            row.appendChild(cell);
        }

        parent.appendChild(row);
    }
}

function createEditor() {
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
        inputSpan.onkeydown = onKeyPress;
        inputSpan.oninput = onKeyPress;
        inputSpan.onfocus = refreshSelectedLine;

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

function onKeyPress(e) {
    if (!ready) {
        return;
    }

    switch (e.key) {
    case "ArrowDown":
        focusNext(1);
        break;

    case "ArrowUp":
        focusNext(-1);
        break;

    default:
        refreshSelectedLine();
        break;
    }
}

function refreshSyntaxDetection() {
    const currInput = document.activeElement;
    const currInputIndex = inputs.indexOf(currInput);

    if (currInputIndex >= 0) {
        refreshSyntaxDetectionOnLine(currInputIndex);
    }
}

function refreshSyntaxDetectionOnLine(index) {
    const parseResult = module.exports.tokenize(inputs[index].value);
    showParserResult(parseResult, index);
}

function focusNext(offset) {
    const currInput = document.activeElement;
    const currInputIndex = inputs.indexOf(currInput);
    let nextinputIndex =
        (currInputIndex + offset) % inputs.length;
    while (nextinputIndex < 0) {
        nextinputIndex = inputs.length + nextinputIndex;

    }

    const input = inputs[nextinputIndex];
    input.setSelectionRange(0,0);
    input.focus();
}

function refreshSelectedLine() {
    const currInput = document.activeElement;
    const currInputIndex = inputs.indexOf(currInput);

    if (currInputIndex >= 0) {
      
        refreshCodeLines();
        refreshSyntaxDetectionOnLine(currInputIndex);
        refreshInputForSelection(currInputIndex);

        refreshTargetedLines();
    }
}

function refreshTargetedLines() {
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
              if (targetedLines[i] === null)
              {
                continue;
              }
              
                const targetedLine = currentCodeLine + targetedLines[i];
                const inputIndex = reverseCodeLinesMap[targetedLine];
                
                if (inputIndex != undefined)
                {
                  const input = document.getElementById(`input-${inputIndex}`);
                  input.className += ` target-${i}`;
                }
            }
        }
    }
}

function refreshCodeLines() {
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

function refreshInputForSelection(index) {
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

function showParserResult(parseResult, index) {

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
                  
                    for (let argIndex in token.arguments) {
                        const a = token.arguments[argIndex];
                        if (a.isReference || a.depth > 0) {
                            targetedLines.push(a.value);
                        }
                        else
                        {
                          targetedLines.push(null);
                        }
                    }

                    val.value = fixSpacesInStatement(val.value);
                    display.innerHTML = getHTMLForToken(token);
                }
            } else {
                explanationsWindow.textContent = "You can write a statement here!";
                display.textContent = val.value;
            }
        }
    }
}

function getHTMLForToken(token)
{
  const elems = [];
  elems.push(`<span class="operator">${token.operatorText}</span>`);
  
  if (token.arguments && token.arguments.length > 0)
  {
    if (token.arguments[0].text)
    {
      elems.push(`<span class="argument-0">${token.arguments[0].text}</span>`);
    }
    
    if (token.arguments.length > 1)
    {
      if (token.linkText)
      {
        elems.push(`<span class="link">${token.linkText}</span>`);
      }
      
      elems.push(`<span class="argument-1">${token.arguments[1].text}</span>`);
    }
  }
  
  return elems.join(' ');
}

function fixSpacesInStatement(str)
{
  str = str.replace(/ +/g, ' ').trimStart();

  return str;  
}
