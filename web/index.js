$(document).ready(function () {
    // Onload
    updateEmail();

    $(".navbar-brand").on("dblclick", function () {
        $.get("/listall", function (data) {
            $("#result").html(data);
        })
    })

    $("#homeicon").on("click", function () {
        updateEmail();
    });

    // Enable Push Notification
    var host = document.location.origin;
    var socket = io.connect(host);
    socket.on('connect', function (data) {
        console.log("Incoming connection : ");

        // Send "initialize" to Server 
        socket.emit('EVENT_CLIENT_INITALIZE');

        socket.on("EVENT_NEW_MAIL", function (data) {
            console.log("Incoming EVENT_NEW_MAIL");
            updateEmail();
        });
    });
});

function updateEmail() {
    $.get("/mail", function (data) {
        $("#result").html(data);
    })
}