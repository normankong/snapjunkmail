var HazelcastClient = require('hazelcast-client').Client;
var SMTPServer = require('smtp-server').SMTPServer;
var getRawBody = require('raw-body')
var winston = require('winston');
var moment = require("moment");

var ip = require("ip");
var IP_ADDRESS = "192.168.86.30"; //ip.address() (Can be replace if you have only 1 IP address);
var port = 2525;

var HAZEL_CAST_MAP = "snapjunkmail_box";
var HAZEL_CAST_QUEUE = "snapjunkmail_queue";

var APP_NAME = "snapjunkmail.com";
var LOG_LABEL = "SMTP";
var LOG_FILE = 'logs/smtp-%DATE%.log';

var MAX_MAIL_COUNT = 10;
var EXPIRY_TIME_IN_MINUTES = 10;

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
server.listen(port, IP_ADDRESS, function () {
    logger = initializeLogger(LOG_LABEL, LOG_FILE);
    logger.info("==========================================================")
    logger.info('[' + APP_NAME + '] SMTP server is listening on port ' + port);
    logger.info("Listing on : " + IP_ADDRESS);
    logger.info("Maximum mail count : " + MAX_MAIL_COUNT);
    logger.info("==========================================================")

    HazelcastClient.newHazelcastClient().then(function (hazelcastClient) {
        map = hazelcastClient.getMap(HAZEL_CAST_MAP);
        queue = hazelcastClient.getQueue(HAZEL_CAST_QUEUE);
    });
});

function onConnect(session, callback) {
    logger.info("onConnect : " + session.remoteAddress + "[" + session.clientHostname + "]");
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
    // logger.info(headerData);

    // //Stand IO
    // stream.pipe(process.stdout); // print message to console
    // logger.info('Session \n', session.envelope);

    // Write Body
    var emlfile = getUuid();
    getRawBody(stream, null, function (err, buffer) {
        var body = buffer.toString();

        // Put to the Queue / Map
        map.put(emlfile, buffer.toString(), EXPIRY_TIME_IN_MINUTES * 60 * 1000);
        queue.put(emlfile).then(function (val) {
            // Cleanup obsolete record
            queue.size().then(function (size) {
                logger.debug("Mailbox Size : " + size + "/" + MAX_MAIL_COUNT);
                if (size > MAX_MAIL_COUNT) {

                    return queue.poll().then(function (val) {
                        logger.info("Clean up overflow mail : " + val)
                        map.remove(val);
                    });
                }
                logger.info("Writing into hazel cast : " + emlfile);

            });
        });
    });

    stream.on('end', callback);
}

function onMailFrom(address, session, callback) {
    logger.info('From  : ' + address.address);
    return callback();
}

function onRcptTo(address, session, callback) {
    logger.info('To    : ' + address.address);
    return callback();
}

function onAuth(auth, session, callback) {
    callback(null, {
        user: ""
    });
}

function onClose() {
    logger.info("=================================================");
}

function getUuid() {
    return moment().format("YYYYMMDD_HHmmss");
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