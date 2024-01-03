const Client = require("./client");

const { createServer } = require("http");
const { Server } = require("socket.io");

const blacklist = require("./blacklist");

const httpServer = createServer();
module.exports =
{
  start: function () {

    const io = new Server(httpServer, {
      // options
      cors: {
        origin: `http://rx.louve.systems:${CONFIG.HTTP_PORT}`,
        methods: ["GET", "POST"]
      },
      // transports: ['websocket', 'polling', 'flashsocket'] 
    });

    io.on("connection", (socket) => {
      if (blacklist.isBannedAddress(socket.handshake.address)) {
        socket.disconnect(true);
      }
      else {
        new Client(socket);
      }
    });

    log.info(`Bootclub socket.io bound on port ${CONFIG.SOCKET_PORT}`)
    httpServer.listen(CONFIG.SOCKET_PORT);
  }
}