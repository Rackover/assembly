// Probably the worst code i've ever written

const tutorial = {};
{
    tutorial.shouldPlayTutorial = false;
    tutorial.step = 0;
    tutorial.intervals = [];

    tutorial.tutorialContainer = null;
    tutorial.manualPageContainer = null;
    tutorial.manual = null;
    tutorial.manualPages = [];
    tutorial.checkTutorialComplete = null;

    tutorial.currentTutorialButton = false;

    tutorial.onWindowLoad = function () {
        tutorial.manual = document.getElementById("manual-page");
        tutorial.manualPageContainer = document.getElementById("pages-container");
        for (const i in tutorial.manualPageContainer.childNodes) {
            const node = tutorial.manualPageContainer.childNodes[i];
            if (node.id && node.id.startsWith("page-")) {
                tutorial.manualPages.push(node);
            }
        }
    }

    tutorial.show = function () {
        tutorial.createTutorialElementsIfNecessary();
        tutorial.step = 1;
        tutorial.setupForCurrentStep();

        tutorial.stopAnimations();
        tutorial.playAnimations();

        globalCore.coreDom.style.display = "none";
    }

    tutorial.createTutorialElementsIfNecessary = function () {
        if (!tutorial.tutorialContainer) {
            tutorial.tutorialContainer = document.createElement("div");
            tutorial.tutorialContainer.id = "tutorial-container";
        }

        interactive.container.appendChild(tutorial.tutorialContainer);
    }

    tutorial.nextStep = function () {
        tutorial.step++;
        tutorial.setupForCurrentStep();
    }

    tutorial.reset = function () {
        if (tutorial.tutorialContainer) {
            interactive.container.removeChild(tutorial.tutorialContainer);
        }

        tutorial.showPage(-1);

        interactive.container.appendChild(interactive.editorContainer);
        interactive.editorContainer.style = {};

        interactive.explanationsWindow.appendChild(interactive.interactiveTextDiv);
        interactive.interactiveTextDiv.style.display = "";

        interactive.container.appendChild(interactive.coreContainer);
        interactive.coreContainer.style.display = "";

        interactive.programNameInput.disabled = false;

        for (const k in interactive.inputs) {
            interactive.inputs[k].disabled = false;
        }

        editorButtons.killTestCoreButton.style.display = "";

        editorButtons.trainingButton.onclick = interactive.testProgram;
        interactive.enableInteractiveHelp = true;
        interactive.enableResponsiveButtons = true;
        interactive.explanationsWindow.style = {};

        interactive.interactiveTextDiv.style = {};
        document.getElementById("access-core").style = {};
        interactive.programNameInput.disabled = false;
        interactive.programNameInput.readOnly = false;

        interactive.refreshTrainingCoreButtons();
        interactive.refreshEditorButtons();
    }

    tutorial.enableButtonsAfterTime = function()
    {
        const elems = document.getElementsByClassName("enable-after-timer");
        for(const k in elems)
        {
            tutorial.enableAfterTime (elems[k]);
        }
    }
    
    tutorial.enableAfterTime = function(dom) 
    {
        dom.disabled = true;
        setTimeout(function(){ dom.disabled = false; }, 2000);
    }

    tutorial.showPage = function (pageIndex) {

        let anyToShow = false;
        for (const i in tutorial.manualPages) {
            tutorial.manualPages[i].style.display = (i == pageIndex) ? "" : "none";
            anyToShow |= i == pageIndex;

            if (i == pageIndex) {
                tutorial.blinkDom(tutorial.manualPages[i]);
            }
        }

        tutorial.manual.style.display = anyToShow ? "" : "none";
    }

    tutorial.setupForCurrentStep = function () {
        tutorial.checkTutorialComplete = null;
        console.log("step %d", tutorial.step);

        function setUpCodeTutorial(buttonText, minLineAllowed, maxLineAllowed, expectedInstruction) {
            for (let i = 0; i < interactive.inputs.length; i++) {
                interactive.inputs[i].disabled = i < minLineAllowed || i >= maxLineAllowed;
            }

            interactive.inputs[minLineAllowed].focus();

            interactive.interactiveTextDiv.innerHTML = document.getElementById(`tutorial-page-${tutorial.step}`).innerHTML;

            const container = document.createElement("div");
            container.className = "buttons-container";

            let b = false;
            if (buttonText) {
                b = document.createElement("button");
                container.appendChild(b);
                b.onclick = tutorial.nextStep;
                b.textContent = buttonText;
                b.className = "shining";
                b.style.display = "none";
                b.disabled = true;

                tutorial.enableAfterTime(b);

                tutorial.currentTutorialButton = b;
                interactive.interactiveTextDiv.appendChild(container);
            }

            tutorial.blinkDom(interactive.explanationsWindow);

            tutorial.checkTutorialComplete = function () {
                tutorial.lastLineTutorialized = false;
                let isGood = false;
                for (let i = 0; i < interactive.inputs.length; i++) {
                    const matches = interactive.inputs[i].value.match(expectedInstruction);
                    if (matches) {
                        isGood = true;
                        tutorial.lastLineTutorialized = i;
                        interactive.inputs[i].value = matches[0];
                    }
                }

                if (buttonText) {
                    b.style.display = isGood ? "" : "none";
                    b.disabled = !isGood;
                }
                else {
                    // Final step
                    editorButtons.trainingButton.style.display = isGood ? "" : "none";
                }
            }
        }

        switch (tutorial.step) {
            case 1:
            case 2:
            case 3:
            case 4:
            case 5:
            case 6:
                {
                    tutorial.showPage(tutorial.step - 1);
                    tutorial.enableButtonsAfterTime ();
                }
                break;

            case 10:
                {
                    tutorial.manual.style.display = "none";

                    interactive.show();
                    interactive.programNameInput.value = `PEBBLE${Math.floor(Math.random() * 99).toString().padStart(2, '0')}.DEL`;
                    interactive.programNameInput.disabled = true;
                    interactive.programNameInput.readOnly = true;

                    document.getElementById("access-core").style.display = "none";
                    document.getElementById("load-program").style.display = "none";
                    document.getElementById("load-sample").style.display = "none";
                    document.getElementById("run-training-program").style.display = "none";

                    interactive.coreContainer.style.display = "none";
                    interactive.enableInteractiveHelp = false;
                    interactive.enableResponsiveButtons = false;

                    interactive.interactiveTextDiv.style.padding = "20px";
                    interactive.interactiveTextDiv.innerHTML = document.getElementById(`tutorial-page-${tutorial.step}`).innerHTML;

                    tutorial.blinkDom(interactive.explanationsWindow);

                    interactive.explanationsWindow.style.flexGrow = 1;
                    interactive.explanationsWindow.style.minWidth = "";
                    interactive.explanationsWindow.style.width = "30%";

                    interactive.editorContainer.style.width = "70%";

                    for (const k in interactive.inputs) {
                        interactive.inputs[k].disabled = "disabled";
                    }
                }

                break;

            case 11:
                {
                    const firstForbiddenInputs = 4;
                    const lastForbiddenInputs = interactive.inputs.length - 4;
                    setUpCodeTutorial("OKAY, NEXT!", firstForbiddenInputs, lastForbiddenInputs, "data 10");
                }
                break;

            case 12:
                {
                    const index = tutorial.lastLineTutorialized - 3;
                    setUpCodeTutorial("OKAY, DONE!", index, index + 1, /(write  *\+?1 to (?:the address given at )? *\+?3)/gi);
                }
                break;

            case 13:
                {
                    const index = tutorial.lastLineTutorialized + 1;
                    setUpCodeTutorial("AND NOW?", index, index + 1, /add  *\+?2 to the value at *\+?2/);
                }
                break;

            case 14:
                {
                    const index = tutorial.lastLineTutorialized + 1;
                    setUpCodeTutorial(false, index, index + 1, "go to -2");
                    editorButtons.trainingButton.onclick = function () {
                        tutorial.nextStep();
                    }
                }
                break;

            case 15:
                {
                    interactive.coreContainer.style.display = "";
                    editorButtons.killTestCoreButton.style.display = "none";
                    interactive.testProgram();

                    interactive.interactiveTextDiv.innerHTML = document.getElementById(`tutorial-page-${tutorial.step}`).innerHTML;
                    tutorial.blinkDom(interactive.explanationsWindow);

                    editorButtons.trainingButton.onclick = interactive.testProgram;
                    
                }
                break;
        }
    }

    tutorial.blinkDom = function (dom) {
        dom.className = dom.className.replace(/blink/gi, "");
        setTimeout(
            function () { dom.className += " blink"; },
            10
        );
    }

    tutorial.stopAnimations = function () {

        for (const i in tutorial.intervals) {
            // Cleanup
            clearInterval(tutorial.intervals[i]);

        }

        tutorial.intervals.length = 0;
    }

    tutorial.playAnimations = function () {

        const speed = 1000;

        /// 3
        {
            // Animate instructions (large)
            const instructionsAnimParent = document.getElementById('tutorial-animation-instructions');
            const cells = [];
            for (const k in instructionsAnimParent.childNodes) {
                if (instructionsAnimParent.childNodes[k].tagName == "DIV" && instructionsAnimParent.childNodes[k].className.includes("oscillate")) {
                    cells.push(instructionsAnimParent.childNodes[k]);
                }
            }

            let turn = 0;
            const anim = function () {

                for (const i in cells) {
                    let isTurn = i == turn;
                    if (isTurn) {
                        cells[i].style.backgroundColor = "yellow";
                        cells[i].style.color = "black";
                    }
                    else {
                        cells[i].style.backgroundColor = "transparent";
                        cells[i].style.color = "gray";
                    }
                }

                turn = (turn + 1) % cells.length;
            };

            anim();
            tutorial.intervals.push(window.setInterval(anim, speed));
        }

        /// 4
        {
            const memAnims = ['tutorial-animation-memory', 'tutorial-animation-memory-shared'];
            for (const k in memAnims) {
                const parentName = memAnims[k];

                // Animate memory (small)
                const instructionsAnimParent = document.getElementById(parentName);
                const cells = [];
                const fastCells = [];
                for (const k in instructionsAnimParent.childNodes) {
                    if (instructionsAnimParent.childNodes[k].tagName == "DIV") {

                        if (instructionsAnimParent.childNodes[k].className.includes("oscillate-slow")) {
                            cells.push(instructionsAnimParent.childNodes[k]);
                            instructionsAnimParent.childNodes[k].style.borderStyle = "solid";
                        }
                        else if (instructionsAnimParent.childNodes[k].className.includes("oscillate-fast")) {
                            fastCells.push(instructionsAnimParent.childNodes[k]);
                            instructionsAnimParent.childNodes[k].style.borderStyle = "solid";
                        }
                        else {
                            instructionsAnimParent.childNodes[k].style.borderStyle = "dotted";
                        }
                    }
                }

                let turn = 0;
                const animSlow = function () {

                    for (const i in cells) {
                        let isTurn = i == turn;
                        if (isTurn) {
                            cells[i].style.background = "yellow content-box";
                        }
                        else {
                            cells[i].style.backgroundColor = "transparent";
                        }
                    }

                    turn = (turn + 1) % cells.length;
                };

                const fastOrder = [0, 2, 3, 0, 1, 2];
                const highlight = 2;
                let fastTurn = 0;
                const animFast = function () {

                    for (const i in fastCells) {
                        let isTurn = i == fastOrder[fastTurn];
                        if (isTurn) {
                            fastCells[i].style.background = "green content-box";
                            if (i == highlight) {
                                fastCells[i].style.borderColor = "green";
                            }
                        }
                        else {
                            fastCells[i].style.backgroundColor = "transparent";
                            if (i == highlight && fastOrder[fastTurn] == 0) {
                                fastCells[i].style.borderColor = "gray";
                            }
                        }
                    }

                    fastTurn = (fastTurn + 1) % fastOrder.length;
                };

                animFast();
                animSlow();

                tutorial.intervals.push(window.setInterval(animSlow, speed / 2));
                window.setTimeout(() => tutorial.intervals.push(window.setInterval(animFast, speed / 2)), speed / 4);
            }
        }

        {
            // Animate instructions (large)
            const memAnims = ['tutorial-animation-instructions-detailed', 'tutorial-animation-instructions-margin'];
            for (const k in memAnims) {

                function setNodeText(node, txt) {
                    if (node.childNodes.length == 1) {
                        node.textContent = txt;
                    }
                    else {
                        node.childNodes[1].textContent = txt;
                    }
                }

                const instructionsAnimParent = document.getElementById(memAnims[k]);
                const programCells = [];
                const cells = [];
                const spans = {};
                const program = {
                    0: function () {
                        setNodeText(cells[9], "1234");
                        cells[9].style.backgroundColor = "darkred";
                    },
                    1: function () {
                        setNodeText(cells[9], "0000");
                        cells[9].style.backgroundColor = "darkred";
                    },
                    2: function () {
                        cells[9].style.backgroundColor = "";
                    },
                    3: function () {
                        setNodeText(cells[0], "5555");
                        cells[0].style.backgroundColor = "darkred";
                    },
                    4: function () {
                        setNodeText(cells[0], "0000");
                        cells[0].style.backgroundColor = "darkred";
                    },
                    5: function () { cells[0].style.backgroundColor = ""; },
                };

                for (const k in instructionsAnimParent.childNodes) {
                    if (instructionsAnimParent.childNodes[k].className && instructionsAnimParent.childNodes[k].className.includes("cell")) {
                        if (instructionsAnimParent.childNodes[k].className.includes("oscillate")) {
                            programCells.push(instructionsAnimParent.childNodes[k]);
                        }

                        cells.push(instructionsAnimParent.childNodes[k]);

                        if (instructionsAnimParent.childNodes[k].childNodes.length > 1) {
                            spans[cells.length - 1] = instructionsAnimParent.childNodes[k].childNodes[0]; // Address
                        }
                    }
                }

                let turn = 0;
                const anim = function () {

                    for (const i in programCells) {
                        let isTurn = i == turn;
                        if (isTurn) {
                            programCells[i].style.backgroundColor = "yellow";
                            programCells[i].style.color = "black";

                            if (program[i]) {
                                program[i]();
                            }
                        }
                        else {
                            programCells[i].style.backgroundColor = "transparent";
                            programCells[i].style.color = "gray";
                        }
                    }

                    for (const i in spans) {
                        if (spans[i]) {
                            const value = i - turn - 2; // Offset of 2
                            const length = 8;
                            let txt = '';
                            if (value >= 0) {
                                txt = `${value.toString().padStart(length, '\u00a0')}`;
                            }
                            else {
                                txt = `-${Math.abs(value).toString().padStart(length - 1, '\u00a0')}`;
                            }

                            spans[i].textContent = txt;
                        }
                    }

                    turn = (turn + 1) % programCells.length;
                };

                anim();
                tutorial.intervals.push(window.setInterval(anim, speed * 2));
            }
        }
    }
}