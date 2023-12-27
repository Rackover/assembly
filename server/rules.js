module.exports = class Rules
{
    killOnDataExecution = true;
    maxWritePerSector = 0;
    maxReadPerSector = 0;
    
    columnSize = 32;
    columnCount = 6;

    randomColumn = true;
    randomPositionInColumn = true;

    fillWithBystanders = false;

    clearOwnershipOnDeath = true;

    runForever = false;
}