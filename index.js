var SMTPServer = require('smtp-server').SMTPServer;
var io = require('socket.io-client');
var fs = require("fs");
var ip = require("ip");
var port = 2525;
// The directory where our maildir formatted e-mai lis stored.
var MAILDIR = "./mail";
var APP_NAME = "snapjunkmail.com";

var BROADCAST_ENDPOINT = 'http://localhost:8080';
var MAX_MAIL_COUNT = 10;
var currentCount = 0;

var serverOptions = {
    name: APP_NAME,
    secure: false,
    authOptional: true,
    logger: false,
    size: 10 * 1024 * 1024,
    banner: APP_NAME,
    onConnect: onConnect,
    onAuth: onAuth,
    onData: onData,
    onMailFrom: onMailFrom,
    onRcptTo: onRcptTo,
    onClose: onClose
};

var server = new SMTPServer(serverOptions);
var socket = null;
server.listen(port, ip.address(), function () {
    console.log("==========================================================")
    console.log('[' + APP_NAME + '] SMTP server is listening on port ' + port);
    console.log("Maximum mail count : " + MAX_MAIL_COUNT);
    console.log("Express Server : " + BROADCAST_ENDPOINT);
    console.log("==========================================================")

    socket = io(BROADCAST_ENDPOINT);
    socket.on('connect', function (data) {
        console.log('Connect to Express Server');
        socket.emit("EVENT_SMTP_SERVER_INITALIZE");
    });

    socket.on('disconnect', function () {
        console.log("Disconnect from Express Server");
    });
});

function onConnect(session, callback) {
    console.log("onConnect : " + session.remoteAddress + "[" + session.clientHostname + "]");
    return callback(); //Accept the connection
}

function onData(stream, session, callback) {
    // var fromAddress = session.envelope.mailFrom.address;
    // var tmpBuffer = "";
    // for (var i=0; i < session.envelope.rcptTo.length; i++)
    // {
    //     tmpBuffer += session.envelope.rcptTo[i].address + ",";
    // }
    // var toAddress = tmpBuffer.substr(0, tmpBuffer.length-1);
    // var dateString = moment().format("YYYY-MM-DD HH:mm:ss");
    // var headerData = "From  : " + fromAddress + "\n";
    //     headerData += "To   : " + toAddress + "\n";
    //     headerData += "Date : " + dateString + "\n";
    //     headerData += "Message Body :\n";
    // console.log(headerData);

    // Write Body
    var emlfile = MAILDIR + "/" + getUuid();
    var tempWriteStream = fs.createWriteStream(emlfile, {
        'flags': 'w'
    });
    stream.pipe(tempWriteStream);
    tempWriteStream.on("finish", function () {
        console.log("Finish writing file " + emlfile);

        // Broad Cast Email
        broadCastEmail();
    });

    // Stand IO
    //stream.pipe(process.stdout); // print message to console
    //console.log('Session \n', session.envelope);
    stream.on('end', callback);


}

function onMailFrom(address, session, callback) {
    console.log('From  : ' + address.address);
    return callback();
}

function onRcptTo(address, session, callback) {
    console.log('To    : ' + address.address);
    return callback();
}

function onAuth(auth, session, callback) {
    callback(null, {
        user: ""
    });
}

function onClose() {
    //   console.log("Closing SMTP Connection");
    console.log("=================================================");
}

function broadCastEmail() {
    if (socket != null && socket.connected) {
        console.log('Broadcast mail');
        socket.emit("EVENT_BROADCAST_MAIL");
    } else {
        console.log("Express Server is not available ", socket);
    }
}

function acquireLock() {
    var lockIndex = currentCount++;
    if (currentCount == MAX_MAIL_COUNT) {
        console.log("Reach maximum mail count " + MAX_MAIL_COUNT);
        currentCount = 0;
    }
    return lockIndex;
}

function getUuid() {
    var curIndex = acquireLock();
    return "mail" + curIndex + ".eml";
}