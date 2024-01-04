const Client = require("./client");
const blacklist = require("./blacklist");

const knownUsers = [];

module.exports =
{
  startWithExpress: function (expressApp) {
    const http = require('http').createServer(expressApp);
    const {Server} = require('socket.io');
    
    const io = new Server(http, {
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
        WORLD.trimCores();
        
        const coreID = WORLD.getCoreIdForClient(socket.handshake.auth.token);
        if (coreID === false) {
          // Game full, maybe dispatch message?
          socket.disconnect(true);
        }
        else {
          new Client(socket, socket.handshake.auth.token, coreID, knownUsers.includes(socket.handshake.auth.token));
        }
        knownUsers.push(socket.handshake.auth.token);
      }
    });

    log.info(`LSASM socket.io bound on port ${CONFIG.HTTP_PORT}`)
    http.listen(CONFIG.HTTP_PORT);
  }
}