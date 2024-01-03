const serverCom = {};

serverCom.setCookie = function(name, value)
{
    document.cookie = `${name}=${value}`;
}

serverCom.getCookie = function(name) {
    function escape(s) { return s.replace(/([.*+?\^$(){}|\[\]\/\\])/g, '\\$1'); }
    var match = document.cookie.match(RegExp('(?:^|;\\s*)' + escape(name) + '=([^;]*)'));
    return match ? match[1] : null;
}

serverCom.clientId = serverCom.getCookie("id");
if(serverCom.clientId  == null)
{
    if (Crypto && Crypto.randomUUID)
    {
        serverCom.clientId = Crypto.randomUUID();
    }
    else
    {
        // https://stackoverflow.com/a/8809472/6230450
        function generateUUID() { // Public Domain/MIT
            var d = new Date().getTime();//Timestamp
            var d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0;//Time in microseconds since page-load or 0 if unsupported
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random() * 16;//random number between 0 and 16
                if(d > 0){//Use timestamp until depleted
                    r = (d + r)%16 | 0;
                    d = Math.floor(d/16);
                } else {//Use microseconds since page-load if supported
                    r = (d2 + r)%16 | 0;
                    d2 = Math.floor(d2/16);
                }
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
        }

        serverCom.clientId = generateUUID();
    }
}

// serverCom.setCookie("id", serverCom.clientId);

const socket = io("ws://rx.louve.systems:4050", {
    reconnectionDelayMax: 10000,
    auth: {
        token: serverCom.clientId
    }
});