
const MAX_RECURSION = 2;
const MAX_PROGRAM_SIZE = 48;

const OPERATIONS =
{
    DATA: 0x0,
    JUMP: 0x1,
    WRITE: 0x2,
    ADD: 0x3,
    SUBTRACT: 0x4,
    COPY: 0x5,
    MOVE: 0x6,
    SKIP_IF_EQUAL: 0x7,
}

const STATEMENT_PARSERS = {
    write: parseWrite,
    add: parseAdd,
    jump: parseJump,
    data: parseData,
    copy: parseCopy,
    move: parseMove,
    "skip if": parseSkipIfEqual,

    // aliases
    "jump to": parseJump,
    "go to": parseJump,
    "data": parseData
}

const WITH_LINKS = [
    "with the value ",
    ","
];

const AT_ADDRESS_LINKS = [
    "at address ",
    "at ",
    ","
];

const EQUAL_LINKS = [
    "is equal to the value ",
    "equals the value ",
    "equals ",
    ","
]

const TO_ADDRESS_LINKS = [
    "to address ",
    "to ",
    ","
]

const REFERENCE_INDICATORS = [
    "the address given at ",
    "the address specified at ",
    "the value given at ",
    "the value specified at ",
    "the value at ",
    "*"
];

module.exports = {
    OPERATIONS: OPERATIONS,

    tokenize: tokenize
}


// Returns a (bool, token list)
function tokenize(strInput) {
    const lines = strInput.split('\n');
    const tokens = [];
    let instructions = 0;
    let allowMeta = false;

    let anyError = false;
    for (i in lines) {
        if (lines[i].trim().length > 0) {
            const token = getToken(i + 1, lines[i], allowMeta);
            if (token.isInstruction) {
                allowMeta = false;
                instructions++;
            
                if (instructions > MAX_PROGRAM_SIZE)
                {
                    if (!token.isError)
                    {
                        token.errorMessage = `The program is too long (instruction ${instructions} out of a maximum of ${MAX_PROGRAM_SIZE} allowed instructions)`;
                        token.isError = true;
                    }
                }
            }

            anyError = anyError || token.isError;
            tokens.push(token);
        }
    }

    return {
        anyError: anyError,
        tokens: tokens
    };
}


// Returns a token
function getToken(lineNumber, line, allowMeta) {
    let token = {};
    const trimmed = line.trim();

    token.contents = trimmed;
    token.lineNumber = lineNumber;

    switch (trimmed[0]) {
        case "@":
            if (allowMeta) {
                token.isMeta = true;
            }
            else {
                token.errorMessage = "Self-description ('@' statement) is not allowed after program definition has began. Please put your self-descriptions before any other program instruction.";
            }

            break;

        case "#":
            {
                token.isComment = true;
            }
            break;

        default:
            parseStatement(token);
            break;
    }

    token.isInstruction = !token.isMeta && !token.isComment;
    token.isError = (undefined != token.errorMessage) && token.errorMessage != "";

    return token;
}

function parseStatement(token) {
    const line = token.contents.toLowerCase();
    token.arguments = [];

    let found = false;

    for (op in STATEMENT_PARSERS) {
        if (line.startsWith(op)) {
            STATEMENT_PARSERS[op](token, line.length > op.length ? line.substring(op.length + 1) : "");
            found = true;
            break;
        }
    }

    if (!found) {
        token.errorMessage = `Unknown operation "${line}". It should start with one of the following: "${Object.keys(STATEMENT_PARSERS).join(", ")}"`;
    }
}

function parseJump(token, data) {
    parseOneArgumentStatement(token, data, "Jump");
    token.operation = OPERATIONS.JUMP;
}

function parseSkipIfEqual(token, data) {
    parseTwoArgumentsStatement(token, data, "SkipEq", EQUAL_LINKS);
    token.operation = OPERATIONS.SKIP_IF_EQUAL;
}

function parseData(token, data) {
    parseOneArgumentStatement(token, data, "Value");

    if (token.arguments.length > 0) {

        token.arguments.push(token.arguments[0]);

        token.arguments[0] = {depth:0, value:0};
    }

    token.operation = OPERATIONS.DATA;
}

function parseMove(token, data) {
    parseTwoArgumentsStatement(token, data, "Move", TO_ADDRESS_LINKS);
    token.operation = OPERATIONS.MOVE;
}

function parseCopy(token, data) {
    parseTwoArgumentsStatement(token, data, "Copy", TO_ADDRESS_LINKS);
    token.operation = OPERATIONS.COPY;
}

function parseWrite(token, data) {
    parseTwoArgumentsStatement(token, data, "Write", AT_ADDRESS_LINKS);
    token.operation = OPERATIONS.WRITE;
}

function parseAdd(token, data) {
    parseTwoArgumentsStatement(token, data, "Add", WITH_LINKS);
    token.operation = OPERATIONS.ADD;
}

function parseOneArgumentStatement(token, data, statementName) {
    let currentData = data;

    const parseResult = parseStatementArgument(currentData);
    const argumentOne = parseResult.argument;

    if (argumentOne.errorMessage) {
        token.errorMessage = `Error parsing argument "${currentData}" of ${statementName} operation: ${argumentOne.errorMessage}`;
    }
    else {
        token.arguments.push(argumentOne);
    }

    return parseResult;
}

function parseTwoArgumentsStatement(token, data, statementName, links) {
    let currentData = data;

    const parseResult = parseOneArgumentStatement(token, currentData, statementName);

    if (token.errorMessage) {
        return;
    }

    currentData = parseResult.remainingData;

    for (i in links) {
        if (currentData.startsWith(links[i])) {
            currentData = currentData.substring(links[i].length);
            const secondParseResult = parseStatementArgument(currentData);
            currentData = secondParseResult.remainingData;
            const argumentTwo = secondParseResult.argument;

            if (argumentTwo.errorMessage) {
                token.errorMessage = `Error parsing second argument "${currentData}" of ${statementName} operation: ${argumentTwo.errorMessage}`;
            }
            else {
                token.arguments.push(argumentTwo);
            }

            return;
        }
    }

    token.errorMessage = `Invalid second argument "${currentData}" in ${statementName} - try specifying "${links[0]}" before it`;
}

// return (argument, data remaining)
function parseStatementArgument(data) {

    let numberString = "";
    let isParsingNumber = false;
    let advance = 0;

    let argument = {};

    argument.depth = 0;

    let referenceFound = true;

    while (referenceFound) {
        referenceFound = false;
        for (i in REFERENCE_INDICATORS) {
            const refIndicator = REFERENCE_INDICATORS[i];
            if (data.substring(advance).startsWith(refIndicator)) {
                advance += refIndicator.length;
                argument.depth++;
                referenceFound = true;
                break;
            }
        }

        if (argument.depth > MAX_RECURSION) {
            argument.errorMessage = `Too many references (more than ${MAX_RECURSION}) on argument "${data}"`;
            break;
        }
    }

    for (; advance < data.length; advance++) {
        if (isCharNumber(data[advance])) {
            isParsingNumber = true;

            numberString += data[advance];
        }
        else if (isParsingNumber) {
            // Was parsing number then stopped, this is the end of the argument
            break;
        }
    }

    let integer = parseInt(numberString);
    argument.value = integer;

    return { argument: argument, remainingData: data.substring(advance + 1).trim() };
}

// Utility
function isCharNumber(c) {
    return c == "-" || c == "+" || (c >= '0' && c <= '9');
}