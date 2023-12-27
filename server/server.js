const express = require('express')
const app = express()
const socket = require('./socket');
const port = 1235

app.use(express.static(__dirname + '/public'));
app.use('/server', express.static(__dirname + "/."))

app.get('/test', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Killcore listening on port ${port}`)
  socket.start();
})

