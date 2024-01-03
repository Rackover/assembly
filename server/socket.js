const Client = require("./client");

const { createServer } = require("http");
const { Server } = require("socket.io");

const blacklist = require("./blacklist");

const knownUsers = [];

const httpServer = createServer();
module.exports =
{
  start: function () {

    const io = new Server(httpServer, {
      // options
      cors: {
        origin: `${CONFIG.HTTP_HOST}:${CONFIG.HTTP_PORT}`,
        methods: ["GET", "POST"]
      },
      // transports: ['websocket', 'polling', 'flashsocket'] 
    });

    io.use((socket, next) => {
      if (socket.handshake.auth.token) {
        if (blacklist.isBannedAddress(socket.handshake.auth.address)) {
          next("invalid parameter");
          log.info(`Refused banned address ${socket.handshake.auth.address}`);
        }
        else {
          next();
        }
      }
      else {
        log.warn(`Refused address ${socket.handshake.auth.address} missing auth`);
        const err = new Error("not authorized");
        err.data = { content: "Please retry later" }; // additional details
        next(err);
      }
    });


    io.on("connection", (socket) => {
      if (blacklist.isBannedAddress(socket.handshake.address)) {
        socket.disconnect(true);
      }
      else {
        new Client(socket, socket.handshake.auth.token, knownUsers.includes(socket.handshake.auth.token));
        knownUsers.push(socket.handshake.auth.token);
      }
    });

    log.info(`LSASM socket.io bound on port ${CONFIG.SOCKET_PORT}`)
    httpServer.listen(CONFIG.SOCKET_PORT);
  }
}