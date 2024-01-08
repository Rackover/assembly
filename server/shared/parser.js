
const MAX_RECURSION = 2;
const MAX_PROGRAM_SIZE = 48;

const COMMENT = "#";
const META_MAGIC = "@";

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
    NOOP: 0x8,

    // XIS
    SKIP_IF_GREATER: 0x9,
    SKIP_IF_LOWER: 0xA,
    MULTIPLY: 0xB,

    // MAX == 0xE
}

const MAX_OP = Object.keys(OPERATIONS).length;

const STATEMENT_PARSERS = {
    write: parseWrite,
    add: parseAdd,
    subtract: parseSubtract,
    multiply: parseMultiply,
    "go to": parseJump,
    data: parseData,
    copy: parseCopy,
    move: parseMove,
    "skip if": parseSkipIf,
    nop: parseNop,

    // aliases
    "jump to": parseJump,
    jump: parseJump,
    "do nothing": parseNop,
}

const TO_WITH_LINKS = [
    "to the value at ",
    "to ",
    "with the value at ", // Sucks but gotta be backward compatible
    ","
];

const WITH_LINKS = [
    "with the value at ",
    "to the value at ",
    "to ",
    ","
];

const FROM_LINKS = [
    "from the value at ",
    "from ",
    ","
]

const AT_ADDRESS_LINKS = [
    "at address ",
    "at ",
    ","
];

const EQUAL_LINKS = [
    "is equal to ",
    "equals ",
    "="
]

const GREATER_LINKS = [
    "is greater than ",
    "greater than ",
    "is over ",
    "over",
    "is bigger than ",
    "bigger than ",
    ">"
]


const LOWER_LINKS = [
    "is less than ",
    "less than ",
    "is under ",
    "under ",
    "is lower than ",
    "lower than ",
    "<"
]


const TO_ADDRESS_LINKS = [
    "to address ",
    "to ",
    ","
]

const TO_AT_ADDRESS_LINKS = [...TO_ADDRESS_LINKS, ...AT_ADDRESS_LINKS];

const REFERENCE_INDICATORS = [
    "the value at ",
    "the address given at ",
    "the address specified at ",
    "the value given at ",
    "the value specified at ",
    "*"
];

module.exports.MAX_OP = MAX_OP;
module.exports.OPERATIONS = OPERATIONS;
module.exports.TO_ADDRESS_LINKS = TO_ADDRESS_LINKS;
module.exports.AT_ADDRESS_LINKS = AT_ADDRESS_LINKS;
module.exports.EQUAL_LINKS = EQUAL_LINKS;
module.exports.GREATER_LINKS = GREATER_LINKS;
module.exports.LOWER_LINKS = LOWER_LINKS;
module.exports.FROM_LINKS = FROM_LINKS;
module.exports.TO_WITH_LINKS = TO_WITH_LINKS;
module.exports.WITH_LINKS = WITH_LINKS;
module.exports.TO_AT_ADDRESS_LINKS = TO_AT_ADDRESS_LINKS;
module.exports.REFERENCE_INDICATORS = REFERENCE_INDICATORS;
module.exports.tokenize = tokenize;


// Returns a (bool, token list)
function tokenize(strInput) {
    const lines = strInput.split('\n');
    const tokens = [];
    let instructions = 0;
    let allowMeta = true;
    let anyError = false;

    const metadata = {};

    for (i in lines) {
        if (lines[i].trim().length > 0) {
            const token = getToken(i + 1, lines[i], allowMeta);
            if (token.isInstruction) {
                allowMeta = false;
                instructions++;

                if (instructions > MAX_PROGRAM_SIZE) {
                    if (!token.isError) {
                        token.errorMessage = `The program is too long (instruction ${instructions} out of a maximum of ${MAX_PROGRAM_SIZE} allowed instructions)`;
                        token.isError = true;
                    }
                }
            }

            if (token.isMeta) {
                metadata[token.metaKey] = token.metaValue;
            }

            anyError = anyError || token.isError;
            tokens.push(token);
        }
        else {
            allowMeta = false;
            // empty line = noop, to preserve line offsets
            tokens.push({
                isInstruction: true,
                operatorText: "",
                contents: "",
                remainingData: "",
                operation: OPERATIONS.NOOP,
                arguments: []
            });
        }
    }

    // Trim program
    for (let i = tokens.length - 1; i > 0; i--) {
        if (tokens[i].contents.length == 0) {
            tokens.pop();
        }
        else {
            break;
        }
    }


    return {
        anyError: anyError,
        tokens: tokens,
        metadata
    };
}


// Returns a token
function getToken(lineNumber, line, allowMeta) {
    let token = {};
    const trimmed = line.trim();

    token.contents = trimmed;
    token.lineNumber = lineNumber;

    switch (trimmed[0]) {
        case META_MAGIC:
            if (allowMeta) {
                token.isMeta = true;
                parseMeta(token);
            }
            else {
                token.errorMessage = "Self-description ('@' statement) is not allowed after program definition has began. Please put your self-descriptions before any other program instruction.";
            }

            break;

        case COMMENT:
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

function parseMeta(token) {
    if (token.contents.length == 1) {
        token.softError = true;
        token.errorMessage = "Empty meta tag!";
        return;
    }

    const line = token.contents;
    let separator = line.indexOf(' ');
    if (separator == -1) {
        separator = line.length;
    }

    const meta = line.substring(0, separator);
    const info = separator < token.contents.length ? line.substring(separator + 1) : 'present';

    token.metaKey = meta.substring(1).toLowerCase();
    token.metaValue = info;
}

function parseStatement(token) {
    const line = token.contents.toLowerCase();
    token.arguments = [];

    let found = false;

    for (op in STATEMENT_PARSERS) {
        if (line.startsWith(op)) {
            token.operatorText = op;
            STATEMENT_PARSERS[op](token, line.length > op.length ? line.substring(op.length + 1) : "");
            found = true;
            break;
        }
    }

    if (!found) {
        token.errorMessage = `Unknown operation "${line}".`;
    }
}

function parseJump(token, data) {
    token.remainingData = parseOneArgumentStatement(token, data, "Jump").remainingData;

    if (token.arguments.length > 0) {
        token.arguments[0].isReference = true;
    }

    token.operation = OPERATIONS.JUMP;
}

function parseSkipIf(token, data) {
    const links = EQUAL_LINKS.concat(GREATER_LINKS, LOWER_LINKS);
    token.remainingData = parseTwoArgumentsStatement(token, data, "SkipIf", links).remainingData;

    if (token.linkText) {
        if (GREATER_LINKS.includes(token.linkText))
        {
            token.operation = OPERATIONS.SKIP_IF_GREATER;
        }
        else if (LOWER_LINKS.includes(token.linkText))
        {
            token.operation = OPERATIONS.SKIP_IF_LOWER;
        }
        else
        {
            token.operation = OPERATIONS.SKIP_IF_EQUAL;
        }
    }
    else {
        token.operation = OPERATIONS.SKIP_IF_EQUAL;
    }
}

function parseData(token, data) {
    token.remainingData = parseOneArgumentStatement(token, data, "Value").remainingData;

    if (token.arguments.length > 0) {

        token.arguments.push(token.arguments[0]);

        token.arguments[0] = { depth: 0, value: 0 };
    }

    token.operation = OPERATIONS.DATA;
}

function parseNop(token, data) {
    token.operation = OPERATIONS.NOOP;
}

function parseMove(token, data) {
    token.remainingData = parseTwoArgumentsStatement(token, data, "Move", TO_ADDRESS_LINKS).remainingData;
    token.operation = OPERATIONS.MOVE;

    for (let k in token.arguments) {
        const arg = token.arguments[k];
        arg.isReference = true;
    }
}

function parseCopy(token, data) {
    token.remainingData = parseTwoArgumentsStatement(token, data, "Copy", TO_ADDRESS_LINKS).remainingData;
    token.operation = OPERATIONS.COPY;

    for (let k in token.arguments) {
        const arg = token.arguments[k];
        arg.isReference = true;
    }
}

function parseWrite(token, data) {
    token.remainingData = parseTwoArgumentsStatement(token, data, "Write", TO_AT_ADDRESS_LINKS).remainingData;
    token.operation = OPERATIONS.WRITE;

    if (token.arguments.length >= 2) {
        token.arguments[1].isReference = true;
    }
}

function parseAdd(token, data) {
    token.remainingData = parseTwoArgumentsStatement(token, data, "Add", TO_WITH_LINKS).remainingData;
    token.operation = OPERATIONS.ADD;

    if (token.arguments.length >= 2) {
        token.arguments[1].isReference = true;
    }
}

function parseMultiply(token, data) {
    token.remainingData = parseTwoArgumentsStatement(token, data, "Multiply", WITH_LINKS).remainingData;
    token.operation = OPERATIONS.MULTIPLY;

    if (token.arguments.length >= 2) {
        token.arguments[1].isReference = true;
    }
}

function parseSubtract(token, data) {
    token.remainingData = parseTwoArgumentsStatement(token, data, "Subtract", FROM_LINKS).remainingData;
    token.operation = OPERATIONS.SUBTRACT;

    if (token.arguments.length >= 2) {
        token.arguments[1].isReference = true;
    }
}

function parseOneArgumentStatement(token, data, statementName) {
    let currentData = data;

    if (currentData.length == 0) {
        token.errorMessage = `Missing first argument for "${token.operatorText}"`;
        token.softError = true;
        return { argument: '', remainingData: data };
    }

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
        return { argument: "", remainingData: currentData };
    }

    currentData = parseResult.remainingData;

    for (i in links) {
        if (currentData.startsWith(links[i])) {

            token.linkText = links[i];

            currentData = currentData.substring(links[i].length);

            const secondParseResult = parseStatementArgument(currentData);
            currentData = secondParseResult.remainingData;
            const argumentTwo = secondParseResult.argument;

            if (argumentTwo.errorMessage) {
                token.errorMessage = `Error parsing second argument "${currentData}" of ${statementName} operation: ${argumentTwo.errorMessage}`;
            }

            // Still push it even if it has an error
            token.arguments.push(argumentTwo);

            return { argument: argumentTwo, remainingData: currentData };
        }
    }

    if (currentData.length == 0) {
        token.errorMessage = `Missing second argument in ${token.operatorText} - try writing "${links[0]}" and then supplying a second argument`;
        token.softError = true;
    }
    else if (links[0].startsWith(currentData)) {
        token.errorMessage = `Missing second argument in ${token.operatorText}.`;
        token.softError = true;
    }
    else {
        token.errorMessage = `Invalid second argument "${currentData}" in ${token.operatorText} - try specifying "${links[0]}" before it`;
    }

    return { argument: "", remainingData: currentData };
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
    if (isNaN(integer)) {
        argument.errorMessage = `"${numberString.length == 0 ? data : numberString}" is not a integer`;
    }

    argument.value = integer;

    argument.text = data.substring(0, advance);

    return { argument: argument, remainingData: data.substring(advance + 1).trim() };
}

// Utility
function isCharNumber(c) {
    return c == "-" || c == "+" || (c >= '0' && c <= '9');
}