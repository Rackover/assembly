module.exports = class ProgramPointer
{
    nextPointerToExecute = 0;
    pointers = [];

    constructor (startAddress)
    {
        this.pointers.push(startAddress);
    }

    get isDead()
    {
        return this.pointers.length == 0;
    }
}