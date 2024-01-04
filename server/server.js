const express = require('express')
const session = require('express-session')
const app = express();
const socket = require('./socket');
const getmac = require('getmac');
const path = require('path');
const fs = require('fs');

global.WORLD = require('./world');
global.CONFIG = require('./configuration');

const CONFIG_FILE_NAME = "config.json";
if (fs.existsSync(CONFIG_FILE_NAME))
{
  global.CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE_NAME, {encoding: 'utf-8'}));
}
else
{
  fs.writeFileSync(CONFIG_FILE_NAME, JSON.stringify(global.CONFIG));
}

app.use(session({
  secret: getmac.default(),
  resave: false,
  saveUninitialized: false
}));

// Hotpatch client URL
app.get('/res/scripts/server-communication.js', (req, res, next) => {
  let index =  fs.readFileSync(path.join(__dirname, 'public/res/scripts/server-communication.js'), 'utf8');
   
  index = index.replace('$SERVER', CONFIG.HTTP_HOST.replace(/^https?:\/\//, ''));
  index = index.replace('$PORT', CONFIG.SOCKET_PORT);

  return res.send(index);
})


app.use(express.static(path.join(__dirname, 'public')));
app.use('/server', express.static(path.join(__dirname, "shared")))

app.listen(CONFIG.HTTP_PORT, () => {
  log.info(`LSASM HTTP listening on port ${CONFIG.HTTP_PORT}`)
  socket.start();
})

