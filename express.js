var HazelcastClient = require('hazelcast-client').Client;
var simpleParser = require('mailparse').simpleParser;
var helmet = require('helmet');
var winston = require('winston');

var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);

var APP_NAME = "snapjunkmail.com";
var LOG_LABEL = "Express";
var LOG_FILE = 'logs/express-%DATE%.log';
var HTTP_PORT = 8088;

var HAZEL_CAST_MAP = "snapjunkmail_box";
var HAZEL_CAST_QUEUE = "snapjunkmail_queue";

var ssList = [];

/**
 *  Get All Mail
 */
app.get('/listall', function (req, res) {
    logger.info("Incoming list all mails request");
    getAllMails().then(function (list) {
        initWebResponse(res);
        processMailResponseHazel(list, res, false, "raw");
    });
});

/**
 * Get the Last Mail
 */
app.get('/mail', function (req, res) {
    logger.info("Incoming get mail request");
    getAllMails().then(function (list) {
        var newList = [];
        if (list.length > 1) {
            newList.push(list.pop());
        }
        initWebResponse(res);
        processMailResponseHazel(newList, res, false, "raw");
    });
});

/**
 * Get the Last Mail
 */
app.get('/mailjson', function (req, res) {
    logger.info("Incoming get mail json request");
    getAllMails().then(function (list) {
        var newList = [];
        if (list.length > 1) {
            newList.push(list.pop());
        }
        initWebResponse(res);
        processMailResponseHazel(newList, res, false, "json");
    });
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
    logger.info("Log Location   : " + LOG_FILE);
    logger.info("==========================================================")

    // Initialize Hazel Cast
    HazelcastClient.newHazelcastClient().then(function (hazelcastClient) {
        map = hazelcastClient.getMap(HAZEL_CAST_MAP);
        queue = hazelcastClient.getQueue(HAZEL_CAST_QUEUE);

        // Add Listener
        map.addEntryListener(listener, undefined, true);
    });
});

io.origins('*:*');
io.sockets.on('connection', function (socket) {
    socket.on("EVENT_CLIENT_INITALIZE", function () {
        connect(socket);
    });

    socket.on('disconnect', function () {
        disconnect(socket);
    });
});

function connect(socket) {
    logger.info('HTTP Socket Connection Event received');
    ssList[ssList.length] = socket;
    logger.info("Totally number of connection : " + ssList.length);
}

function disconnect(socket) {
    logger.info('HTTP Socket Disconnected Event received');
    for (var i = 0; i < ssList.length; i++) {
        if (ssList[i] == socket) {
            logger.info("Disconnect " + (i + 1) + "/" + ssList.length);
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

function initWebResponse(res) {
    res.set('Content-Type', 'text/html');
}

function processMailResponseHazel(list, res, haveMail, format) {
    var item = list.shift();
    if (item == null) // Last one
    {
        if (!haveMail) {
            if (format == "raw") {
                res.write("There is no mail available");
            } else {
                var result = {
                    code: "999"
                };
                var buffer = JSON.stringify(result);
                res.write(buffer);
            }
        }
        res.end();
        return;
    }

    map.get(item).then(function (source) {
        if (source != null) {
            logger.info("Reading email : " + item);
            simpleParser(source, (err, mail) => {

                if (format == "raw") {
                    var buffer = "";
                    buffer += "Date : " + mail.date + "<br/>";
                    buffer += "From : " + mail.from.text + "<br/>";
                    buffer += "To : " + mail.to.text + "<br/>";
                    buffer += "Subject : " + mail.subject + "<br/";
                    buffer += "Body : " + "<br/>";
                    buffer += mail.textAsHtml;
                    buffer += "<hr/>";
                } else {
                    var result = {
                        code: "000",
                        date: mail.date,
                        from: mail.from.text,
                        to: mail.to.text,
                        subject: mail.subject,
                        body: mail.text
                    };

                    var buffer = JSON.stringify(result);
                }

                res.write(buffer);
                processMailResponseHazel(list, res, true, format);
            })
        } else {
            logger.info("Reading email : " + item + " have expired");
            processMailResponseHazel(list, res, haveMail, format);
        }
    });
}

/**
 * Return All Mail
 */
function getAllMails() {
    return queue.toArray();
};

/**
 * Map Listener
 */
var listener = {
    added: function (key, oldVal, newVal) {
        broadcastNewMail();
    },
    updated: function (key, oldVal, newVal) {
        broadcastNewMail();
    }
};

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