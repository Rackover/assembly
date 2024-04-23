module.exports.Rules = class
{
    killOnDataExecution = true;
    maxWritePerSector = 0;
    maxReadPerSector = 0;
    
    columnSize = 32;
    columnCount = 6;

    randomColumn = true;
    randomPositionInColumn = true;

    bystanders = 0;
    repopulateBystanderEveryTick = 50;

    clearOwnershipOnDeath = true;
    writeInstructionOwner = true;

    runForever = false;
}