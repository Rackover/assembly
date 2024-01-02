const express = require('express')
const app = express()
const socket = require('./socket');
const port = 4051;

global.GLOBAL_CORE = new (require("./global_core"));

app.use(express.static(__dirname + '/public'));
app.use('/server', express.static(__dirname + "/."))

app.listen(port, () => {
  console.log(`Killcore listening on port ${port}`)
  socket.start();
})

