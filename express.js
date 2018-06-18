var simpleParser = require('mailparse').simpleParser;
var helmet = require('helmet');
var winston = require('winston');

var express = require('express');
var fs = require('fs');
var path = require('path');
var _ = require('underscore');

var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);

var APP_NAME = "snapjunkmail.com";
var LOG_LABEL = "Express";
var LOG_FILE = 'logs/express-%DATE%.log';
var EXPIRY_TIME_IN_MINUTES = 1;
var HTTP_PORT = 8088;
var MAIL_DIR = "mail/";
var ssList = [];
var ssSMTP = null;

/**
 *  List all Mail
 */
app.get('/listall', function (req, res) {
    logger.info("Incoming list all mails request");
    var list = getAllMails(MAIL_DIR);
    initWebResponse(list, res);
    processMailResponse(list, res);
});

/**
 * Get the Last Mail
 */
app.get('/mail', function (req, res) {
    logger.info("Incoming get mail request");
    var list = [];
    var latestEmail = getLatestEmail(MAIL_DIR);
    if (latestEmail != null) list.push(latestEmail);
    initWebResponse(list, res);
    processMailResponse(list, res);
});

/**
 * Simulate New Mail Event
 */
app.get('/simEmail', function (req, res) {
    broadcastNewMail();
    res.send("Broadcast Message have been send");
});

app.set('port', HTTP_PORT);
app.use('/', express.static('web'));
app.use(helmet());

// Initialize and make sure Port is reachable
server.listen(app.get('port'), function () {
    logger = initializeLogger(LOG_LABEL, LOG_FILE);
    logger.info("==========================================================")
    logger.info("[" + APP_NAME + "] Web server is listening on port " + app.get('port'));
    logger.info("Mail Directory : " + MAIL_DIR);
    logger.info("Expiry Time    : " + EXPIRY_TIME_IN_MINUTES + " minutes");
    logger.info("Log Location   : " + LOG_FILE);
    logger.info("==========================================================")
});

io.origins('*:*');
io.sockets.on('connection', function (socket) {
    socket.on("EVENT_CLIENT_INITALIZE", function () {
        connect(socket);
    });

    socket.on('disconnect', function () {
        disconnect(socket);
    });

    // For SMTP Server Initialize
    socket.on("EVENT_SMTP_SERVER_INITALIZE", function () {
        logger.info("SMTP is connected");
        ssSMTP = socket;
    });

    // SMTP notify for udpate
    socket.on("EVENT_BROADCAST_MAIL", function () {
        broadcastNewMail();
    });
});

function connect(socket) {
    logger.info('HTTP Socket Connection Event received');
    ssList[ssList.length] = socket;
    logger.info("Totally number of connection : " + ssList.length);
}

function disconnect(socket) {
    if (socket === ssSMTP) {
        logger.info("SMTP Socket was disconnected");
        return;
    }

    logger.info('HTTP Socket Disconnected Event received');
    for (var i = 0; i < ssList.length; i++) {
        if (ssList[i] == socket) {
            logger.info("Disonnect " + (i + 1) + "/" + ssList.length);
            ssList.splice(i, 1);
        }
    }
    logger.info("Totally number of connection : " + ssList.length);
}

function broadcastNewMail() {
    var eventType = "EVENT_NEW_MAIL";
    var data = "PLEASE_CHECK_EMAIL";
    logger.info("Send " + eventType + " to " + ssList.length + " connections", data);
    for (var i = 0; i < ssList.length; i++) {
        var ss = ssList[i];
        ss.emit(eventType, data);
    }
}

function initWebResponse(list, res) {
    res.set('Content-Type', 'text/html');
    if (list.length == 0) {
        res.write("There is no mail available");
    }
}

function processMailResponse(list, res) {
    var item = list.shift();
    if (item == null) // Last one
    {
        res.end();
        return;
    }

    logger.info("Reading email : " + MAIL_DIR + item);
    var filename = MAIL_DIR + item;
    var source = fs.createReadStream(filename);
    simpleParser(source, (err, mail) => {
        var buffer = "";
        buffer += "Date : " + mail.date + "<br/>";
        buffer += "From : " + mail.from.text + "<br/>";
        buffer += "To : " + mail.to.text + "<br/>";
        buffer += "Subject : " + mail.subject + "<br/";
        buffer += "Body : " + "<br/>";
        buffer += mail.textAsHtml;
        buffer += "<hr/>";
        res.write(buffer);
        processMailResponse(list, res);
    })
};

/**
 * @param {Directory that need to scan mail} dir 
 * Return the latest mail without EXPIR_TIME_IN_MINUTES
 */
function getLatestEmail(dir) {

    var files = fs.readdirSync(dir).filter(function (x) {
        var isEmail = x.endsWith(".eml");
        if (!isEmail) return false;
        var now = new Date().getTime();
        var mTime = fs.statSync(dir + x).mtime.getTime();
        return mTime > now - (EXPIRY_TIME_IN_MINUTES * 60 * 1000);
    });

    if (files.length == 0) return null;
    // use underscore for max()
    return _.max(files, function (f) {
        var fullpath = path.join(dir, f);
        return fs.statSync(fullpath).ctime;
    });
}

/**
 * @param {Directory that need to scan mail} dir 
 * Return sorting email list
 */
function getAllMails(dir) {
    var files = fs.readdirSync(dir).filter(function (x) {
        return x.endsWith(".eml");
    });;

    var result = files.sort(function (a, b) {
        return fs.statSync(dir + b).mtime.getTime() -
            fs.statSync(dir + a).mtime.getTime();

    });
    return result;
}

/**
 * Initialize Logger
 */
function initializeLogger(labelName, logFile) {
    const {
        createLogger,
        format,
        transports
    } = require('winston');
    const {
        combine,
        timestamp,
        label,
        printf
    } = format;

    const myFormat = printf(info => {
        return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`;
    });

    require('winston-daily-rotate-file');
    var transport = new(winston.transports.DailyRotateFile)({
        filename: logFile,
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d'
    });

    const logger = createLogger({
        level: 'info',
        format: combine(
            label({
                label: labelName
            }),
            timestamp(),
            myFormat
        ),
        transports: [
            new transports.Console(),
            transport
        ]
    });
    return logger;
}