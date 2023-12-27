
const socket = io("ws://localhost:1234", {
  reconnectionDelayMax: 10000
});


socket.on("core", function(data){
  displayCore(data);
});

