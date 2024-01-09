const Client = require("./client");
const blacklist = require("./blacklist");

module.exports =
{
  startWithExpress: function (expressApp) {
    const http = require('http').createServer(expressApp);
    const { Server } = require('socket.io');

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

      let unknown = true;
      const address = socket.handshake.headers && socket.handshake.headers["x-forwarded-for"] ?
        socket.handshake.headers["x-forwarded-for"].split(',')[0] :
        socket.handshake.address;

      if (blacklist.isBannedAddress(address)) {
        socket.disconnect(true);
      }
      else {
        WORLD.trimCores();

        const id = socket.handshake.auth.token;

        if (!id || typeof id !== 'string' || id.length < 16) {
          log.warn(`Refusing client address ${address} with invalid id ${id} (joker edited cookie probably)`);
          socket.disconnect(true);
          return;
        }

        const coreID = WORLD.getCoreIdForClient(id);
        if (coreID === false) {
          // Game full, maybe dispatch message?
          socket.disconnect(true);
        }
        else {
          const knownUser = WORLD.getUserList()[id];
          unknown = !knownUser;
          new Client(
            socket,
            id,
            coreID,
            knownUser !== undefined,
            unknown || !knownUser.completedTutorial
          );
        }

        // Add to known list
        if (unknown) {
          WORLD.getUserList()[id] = {};
        }

        const clientCount = WORLD.getClientCount();
        log.info(`We currently have ${clientCount}(+) active clients`);
      }
    });

    log.info(`LSASM socket.io bound on port ${CONFIG.HTTP_PORT}`)
    http.listen(CONFIG.HTTP_PORT);
  }
}