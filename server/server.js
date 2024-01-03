const express = require('express')
const session = require('express-session')
const app = express();
const socket = require('./socket');
const getmac = require('getmac');

global.WORLD = require('./world');
global.CONFIG = require('./configuration');

app.use(session({
  secret: getmac.default(),
  resave: false,
  saveUninitialized: false
}));


app.get('/', (req, res, next) => {
  // req.sessionID
  next();
})


app.use(express.static(__dirname + '/public'));
app.use('/server', express.static(__dirname + "/."))

app.listen(CONFIG.HTTP_PORT, () => {
  log.info(`Bootclub HTTP listening on port ${CONFIG.HTTP_PORT}`)
  socket.start();
})

