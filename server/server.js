const express = require('express')
const session = require('express-session')
const app = express();
const socket = require('./socket');
const getmac = require('getmac');
const path = require('path');
const fs = require('fs');

const PLAYERS_FILENAME = "known-players.json";

// FILE OPS
initializeWorld();
initializeConfig();
// END

initializeStatistics();

app.use(session({
  secret: getmac.default(),
  resave: false,
  saveUninitialized: false
}));

// Hotpatch client URL
app.get('/res/scripts/server-communication.js', (req, res, next) => {
  let index = fs.readFileSync(path.join(__dirname, 'public/res/scripts/server-communication.js'), 'utf8');

  const uri = `${CONFIG.HTTP_HOST.replace('http', 'ws')}${(CONFIG.SECURE_CONTEXT ? '' : `:${CONFIG.HTTP_PORT}`)}`;
  index = index.replace('$URI', uri);

  return res.send(index);
})


app.use(express.static(path.join(__dirname, 'public')));
app.use('/server', express.static(path.join(__dirname, "shared")))

// On exit shenanigans
{
  function exitHandler(shouldExit) {
    saveWorld();
    STATS.terminate();

    if (shouldExit) {
      process.exit();
    }
  }

  // do something when app is closing
  process.on('exit', exitHandler.bind(null));

  process.on('uncaughtException', function (e) {
    console.log('Uncaught Exception...');
    console.log(e.stack);
    process.exit(99);
  });

  // catches ctrl+c event
  process.on('SIGINT', exitHandler.bind(null, true));
}

socket.startWithExpress(app);

function initializeStatistics()
{
  global.STATS = require('./statistics');
}

function initializeWorld() {
  global.WORLD = require('./world');
  
  if (fs.existsSync(PLAYERS_FILENAME)) {
    try {
      WORLD.loadUserList(JSON.parse(fs.readFileSync(PLAYERS_FILENAME, { encoding: 'utf-8' })));
    }
    catch (e) {
      log.error(`while loading user list: ${e}`);
    }
  }
}

function initializeConfig() {
  global.CONFIG = require('./configuration');
  const CONFIG_FILE_NAME = "config.json";
  if (fs.existsSync(CONFIG_FILE_NAME)) {
    global.CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE_NAME, { encoding: 'utf-8' }));
  }
  else {
    fs.writeFileSync(CONFIG_FILE_NAME, JSON.stringify(global.CONFIG));
  }
}

function saveWorld()
{
  if (WORLD) {
    fs.writeFileSync(PLAYERS_FILENAME, JSON.stringify(WORLD.getUserList(), null, 4));
  }
}