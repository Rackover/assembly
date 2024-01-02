const Client = require("./client");

const { createServer } = require("http");
const { Server  }= require("socket.io");

const httpServer = createServer();
const io = new Server(httpServer, {
  // options
  cors: {
    origin: "http://rx.louve.systems:4051",
    methods: ["GET", "POST"]
  },
  // transports: ['websocket', 'polling', 'flashsocket'] 
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
        console.log("socket.io bound on port 4050")
        httpServer.listen(4050);
    }
}