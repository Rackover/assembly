module.exports = class ProgramPointer
{
    nextPointerToExecute = 0;
    pointers = [];
    programId = 0;

    constructor (programId, startAddress)
    {
        this.programId = programId;
        this.pointers.push(startAddress);
    }

    get isDead()
    {
        return this.pointers.length == 0;
    }
}