const Client = require("./client");

const { createServer } = require("http");
const { Server  }= require("socket.io");

const httpServer = createServer();
const io = new Server(httpServer, {
  // options
  cors: {
    origin: "http://localhost:1234",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  // ...
  new Client(socket);
});

module.exports = 
{
    sendCoreToEveryone: function(core)
    {
        io.sockets.emit("core", core);
    },
    start: function()
    {
        console.log("socket.io bound on port 1234")
        httpServer.listen(1234);
    }
}