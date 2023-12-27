const TestCore = require("./test_core");

const SPEEDS_MS = [
    2000,
    1000,
    500,
    250,
    100
];

module.exports = class{


    #interval;
    #socket;
    #testCore;
    #testCoreSpeed;

    #lastFrameTime = false;
    #buff = false;
    
    constructor(socket)
    {
        socket.on("stopTestingProgram", (function(){
            this.#testCore = false;
        }).bind(this));

        socket.on("setSpeed", (function(speedInt){
            this.#testCoreSpeed = speedInt;
        }).bind(this));

        socket.on("testProgram", (function(programName, programString, speed)
        {
            const core = new TestCore(programName, programString);
            if (core.state == core.EState.INVALID)
            {
                socket.emit("invalidProgram", programName);
            }
            else
            {
                this.#testCore = core;
                this.#sendTestCore();
                this.#interval = setInterval(this.#frame.bind(this), SPEEDS_MS[0]); // Tick as fast as we may
                this.#testCoreSpeed = speed;
            }
        }).bind(this));

        socket.on("reconnect_failed", (function()
        {
            console.log("Killing client, reconnect failed");
            clearInterval(this.#interval); // Kill client
        }).bind(this));

        socket.on("error", (function()
        {
            console.log("Killing client, connection error");
            clearInterval(this.#interval); // Kill client
        }).bind(this));

        socket.on("disconnect", (function()
        {
            console.log("Killing client, disconnect");
            clearInterval(this.#interval); // Kill client
        }).bind(this));


        this.#socket = socket;
    }

    #frame()
    {
        if (this.#testCore && this.#testCore.state != this.#testCore.EState.HALTED)
        {
            const frameLengthMs = SPEEDS_MS[Math.min(Math.max(0, this.#testCoreSpeed), SPEEDS_MS.length-1)];

            const now = Date.now();
            if (this.#lastFrameTime == false || (now - this.#lastFrameTime) > frameLengthMs)
            {
                this.#testCore.advance();
                this.#sendTestCore();
                this.#lastFrameTime = now;
            }
        }
    }

    #sendTestCore()
    {
        if (!this.#buff)
        {
            this.#buff = this.#testCore.dump();
        }
        else
        {
            this.#testCore.dumpToBuffer(this.#buff);
        }

        this.#socket.emit("testCore", this.#testCore.columnCount, this.#testCore.columnSize, this.#buff);
    }
}