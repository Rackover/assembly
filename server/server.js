const express = require('express')
const session = require('express-session')
const app = express();
const socket = require('./socket');
const getmac = require('getmac');
const path = require('path');
const fs = require('fs');

const SCORES_FILENAME = "saved-scores.json";

global.WORLD = require('./world');
if (fs.existsSync(SCORES_FILENAME))
{
  try{
    WORLD.loadHighscores(JSON.parse(fs.readFileSync(SCORES_FILENAME, {encoding:'utf-8'})));
  }
  catch(e){
    log.error(e);
  }
}

global.CONFIG = require('./configuration');

const CONFIG_FILE_NAME = "config.json";
if (fs.existsSync(CONFIG_FILE_NAME)) {
  global.CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE_NAME, { encoding: 'utf-8' }));
}
else {
  fs.writeFileSync(CONFIG_FILE_NAME, JSON.stringify(global.CONFIG));
}

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
    if (WORLD)
    {
      const scores = WORLD.getHighscores();
      fs.writeFileSync(SCORES_FILENAME, JSON.stringify(scores));
    }

    if (shouldExit)
    {
      process.exit();
    }
  }

  // do something when app is closing
  process.on('exit', exitHandler.bind(null));

  process.on('uncaughtException', function(e) {
    console.log('Uncaught Exception...');
    console.log(e.stack);
    process.exit(99);
  });
  
  // catches ctrl+c event
  process.on('SIGINT', exitHandler.bind(null, true));
}

socket.startWithExpress(app);

