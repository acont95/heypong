"use strict";
// Establish a websocket connection to server.
var ws = new WebSocket("wss://" + location.host + "/ws");

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const nextButton = document.getElementById('nextButton');
const autoNext = document.getElementById('autoNext');
const loader = document.getElementById('loader');
const numUsers = document.getElementById('numUsers');
const messageList = document.getElementById("chatBox");
const textInput = document.getElementById("textInput");
const sendMessageButton = document.getElementById("sendMessageButton");
let typing = false;
let userTyping = false;
let typingTimeout = null;
let waiting = false;
let countDown;
let autoNextTimeout = null;

let localStream = null;

nextButton.textContent = "Next";
sendMessageButton.disabled = true;
textInput.disabled = true;

//Client identifier to be returned by signaling server.
let clientId = null;
const numPeers = 2;
const connectionState = false;

let connectionMap = new Map();

sendMessageButton.addEventListener("click", sendMessage);
textInput.addEventListener("keydown", enterKeyMessage);
textInput.addEventListener("keydown", sendTyping);
nextButton.addEventListener('click', handleNextButtonClick);

// Add STUN/TURN servers.
const configuration = {
    iceServers: [
        {
            urls: ["stun:stun.l.google.com:19302"]
        },
        {
            urls: ["stun:stun1.l.google.com:19302"]
        },
        {
            urls: ["stun:stun2.l.google.com:19302"]
        },
        {
            urls: ["stun:stun3.l.google.com:19302"]
        },
        {
            urls: ["stun:stun4.l.google.com:19302"]
        }
    ]
};

function getUserMedia() {
    let stream = null;
  
    navigator.mediaDevices.enumerateDevices().then(
        async function(devices) {
            const mics = devices.filter(device => device.kind =='audioinput');
            const mediaStreamConstraints = {
                audio: mics.length > 0,
                video: true
            };
            stream = await navigator.mediaDevices.getUserMedia(mediaStreamConstraints);
            localVideo.srcObject = stream;
            localStream = stream;
            nextButton.disabled = false;
        }
    ).catch(
        function(err) {
            /* handle the error */
            showEnableCameraMessage();
            nextButton.disabled=true;
        }
    )
};

function showEnableCameraMessage() {
    const item = document.createElement('li');
    item.className = "showCamera";
    item.textContent = "Camera must be enable to use heypong. Please refresh page and enable your camera.";
    messageList.appendChild(item);
    scrollChatBottom();
};

function sendOffer(peerConnection, peerTarget) {
    ws.send(
        JSON.stringify(
            {
                type: "offer",
                description: peerConnection.localDescription,
                target: peerTarget,
                caller: clientId
            }
        )
    );    
};

function sendAnswer(peerConnection, peerTarget) {
    ws.send(
        JSON.stringify(
            {
                type: "answer",
                target: peerTarget,
                caller: clientId,
                description: peerConnection.localDescription
            }
        )
    );
};

function handleOffer(offer) {
    const peerTarget = offer['caller'];
    var description = new RTCSessionDescription(offer['description']);
    
    newPeerConnection(peerTarget);
    const peerConnection = connectionMap.get(peerTarget);

    peerConnection.setRemoteDescription(description).then(
        function() {
            localStream.getTracks().forEach(
                function(track) {
                    peerConnection.addTrack(track, localStream);
                }
            );
        }
    ).then(
        function() {
            return peerConnection.createAnswer();
        }
    ).then(
        function(answer) {
            return peerConnection.setLocalDescription(answer);
        }
    ).then(
        function() {
            sendAnswer(peerConnection, peerTarget);
        }
    )
};

function handleAnswer(answer) {
    const caller = answer['caller'];
    var description = new RTCSessionDescription(answer['description']);
    connectionMap.get(caller).setRemoteDescription(description);
}

function sendDisconnect() {
    ws.send(
        JSON.stringify(
            {
                type: "disconnect",
                target: Array.from(connectionMap.keys()),
                caller: clientId
            }
        )
    );
};

function setUserTyping() {
    const item = document.createElement('li');
    item.className = "userTyping";

    const typingLogo = document.createElement('img');
    typingLogo.className = "typingLogo";
    typingLogo.src = "/static/typing.svg";

    item.appendChild(typingLogo);
    messageList.appendChild(item);
    scrollChatBottom();
    userTyping = true;
};

function removeUserTyping() {
    var listItems = messageList.getElementsByClassName('userTyping');
    var last = listItems[listItems.length - 1];
    messageList.removeChild(last);
    userTyping = false;
};

function moveUserTyping() {
    removeUserTyping();
    setUserTyping();
};

function sendTyping(event) {
    if (event.keyCode !== 13) {
        if (!typing) {
            ws.send(
                JSON.stringify(
                    {
                        type: "typing",
                        target: Array.from(connectionMap.keys()),
                        caller: clientId
                    }
                )
            )

            typing = true;
            setTimeout(function() {
                typing = false;
            }, 1000)
        }
    }
}

ws.onmessage = function(event) {
    var data = JSON.parse(event.data);

    if (data['type'] === "new-ice-candidate") {
        connectionMap.get(data['caller']).addIceCandidate(data['candidate']);
    }
    else if (data['type'] === "offer") {
        handleOffer(data);
    } 
    else if (data['type'] === "answer") {
        handleAnswer(data);
    } 
    else if (data['type'] === "client-identifier") {
        clientId = data['id'];
        getUserMedia();
        setNumUsers();
    }
    else if (data['type'] === "chat") {
        const msg = data['message'];
        appendRecievedMessage(msg);
        if (userTyping) {
            removeUserTyping();
            clearTimeout(typingTimeout);
        }
    }
    else if (data['type'] === "disconnect") {
        if (connectionMap.size) {
            handleDisconnect();
        }
    }
    else if (data['type'] === "typing") {
        if (!userTyping) {
            setUserTyping();
            typingTimeout = setTimeout(function() {
                if (userTyping){
                    removeUserTyping();
                }
            }, 2000);
        }
        else {
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(function() {
                if (userTyping){
                    removeUserTyping();
                }
            }, 2000);
        }
    }
};

async function getPeerId() {
    const url = `/new_peer?client_id=${clientId}`;
    var result = await fetch(url);
    if (result.ok) {
        const response = await result.json();
        return response['peer'];
    }
};

async function getNumUsers() {
    const url = `/num_users`;
    var result = await fetch(url);
    if (result.ok) {
        const response = await result.json();
        return response['num_users'];
    }
};

async function setNumUsers() {
    const n = await getNumUsers();
    numUsers.textContent = `Users Online: ${n}`
}

function newPeerConnection(peerTarget) {
    const peerConnection = new RTCPeerConnection(configuration);
    peerConnection.onicecandidate = handleOnIceCandidate;
    peerConnection.onnegotiationneeded = handleOnNegotiationNeeded;
    peerConnection.ontrack = handleOnTrack;
    peerConnection.oniceconnectionstatechange = handleICEConnectionStateChange;

    connectionMap.set(peerTarget, peerConnection);

    function handleOnIceCandidate(event) {
        if (event.candidate) {
            ws.send(
                JSON.stringify(
                    {
                        type: "new-ice-candidate",
                        candidate: event.candidate,
                        target: peerTarget,
                        caller: clientId
                    }
                )
            );
        } else {
            /* there are no more candidates coming during this negotiation*/
        }
    };
    
    function handleOnNegotiationNeeded() {
        try {
            peerConnection.createOffer().then(
                function(offer) {
                    return peerConnection.setLocalDescription(offer);
                }
            ).then(
                function() {
                    sendOffer(peerConnection, peerTarget);
                }
            );
        }
        catch (err) {
            console.error(err);
        }
    };
    
    function handleOnTrack(event) {
        remoteVideo.srcObject = event.streams[0];
    };

    function handleICEConnectionStateChange(event) {
        switch(peerConnection.iceConnectionState) {
            case "failed":
            case "closed":
            case "disconnected":
                if (connectionMap.size) {
                    handleDisconnect();
                }
                break;
            
            case "completed":
            case "connected":
                textInput.disabled = false;
                sendMessageButton.disabled = false;
                disableLoaderAnimation();
                break;
        }
    }
};

function initiate_offer(peerTarget) {
    const peerConnection = connectionMap.get(peerTarget);
    localStream.getTracks().forEach(
        function(track) {
            peerConnection.addTrack(track, localStream)
        }
    );
};

async function nextVideoChat() {
    var peerTarget = await getPeerId();
    if (peerTarget){
        newPeerConnection(peerTarget);
        initiate_offer(peerTarget);
    }
    else {
    }
};

function startTimer(duration, display) {
    var timer = duration, minutes, seconds;
    countDown = setInterval(function () {
        minutes = parseInt(timer / 60, 10);
        seconds = parseInt(timer % 60, 10);

        minutes = minutes < 10 ? "0" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;

        display.textContent = "New chat in: " + seconds;

        if (--timer < 0) {
            clearInterval(countDown);
        }
    }, 1000);
};

function showTimer() {
    const item = appendTimer();
    startTimer(2, item);
};

function removeLastList() {
    var listItems = messageList.getElementsByTagName('li');
    if (listItems.length) {
        var last = listItems[listItems.length - 1];
        messageList.removeChild(last);
    }
};

function handleNextButtonClick() {
    sendMessageButton.disabled = true;
    textInput.disabled = true;
    if (autoNextTimeout !== null) {
        removeLastList();
        clearInterval(countDown);
        clearTimeout(autoNextTimeout);
        autoNextTimeout = null;
        waiting = false;
        nextButton.textContent = "Next";
        disableLoaderAnimation();
        sendDisconnect();
        closeVideoCall();
    }
    else if (connectionMap.size && !autoNext.checked) {
        waiting = false;
        nextButton.textContent = "Next";
        sendDisconnect();
        closeVideoCall();
    }
    else if (connectionMap.size && autoNext.checked) {
        waiting = false;
        nextButton.textContent = "Stop";
        sendDisconnect();
        closeVideoCall();
        showTimer();
        autoNextTimeout = setTimeout(function() {
            autoNextTimeout = null;
            nextButton.click();
        }, 3000);
    }
    else if (!connectionMap.size) {
        if (!waiting) {
            waiting = true;
            nextButton.textContent = "Stop";
            enableLoaderAnimation();
            closeVideoCall();
            clearChat();
            nextVideoChat();
        } 
        else if (waiting) {
            waiting = false;
            nextButton.textContent = "Next";
            disableLoaderAnimation();
            sendDisconnect();
            closeVideoCall();
        } 
    }
}

function handleDisconnect() {
    waiting = false;
    textInput.disabled = true;
    sendMessageButton.disabled = true;
    if (autoNext.checked) {
        nextButton.click();
    }
    else {
        nextButton.textContent = "Next";
        closeVideoCall();
    }
};

function clearChat() {
    messageList.innerHTML = "";
};

function closeVideoCall() {
    if (connectionMap.size) {
        connectionMap.forEach(
            function(pc, peerTarget, map) {
                pc.close();
                pc = null;
            }
        );
        connectionMap.clear();

        if (remoteVideo.srcObject) {
            remoteVideo.srcObject.getTracks().forEach(
                function(track) {
                    track.stop();
                }
            );
            remoteVideo.pause();
            remoteVideo.removeAttribute("src");
            remoteVideo.removeAttribute("srcObject");
            remoteVideo.load();
            remoteVideo.srcObject = null;
        }
    }
};

// Chat 
function sendMessage(event) {
    const msg = textInput.value;
    if (connectionMap.size > 0) {
        ws.send(
            JSON.stringify(
                {
                    type: "chat",
                    message: msg,
                    target: Array.from(connectionMap.keys()),
                    caller: clientId
                }
            )
        );   
        appendSentMessage(msg);
        if (userTyping) {
            moveUserTyping();
        }
        textInput.value = "";
    } 
};

function enterKeyMessage(event) {
    if (event.keyCode === 13) {
        event.preventDefault();
        event.stopImmediatePropagation();
        sendMessageButton.click();
    }
};

function appendSentMessage(msg) {
    if (msg) {
        const item = document.createElement('li');
        item.className = "sentMessage";
        item.textContent = msg;
        messageList.appendChild(item);
        scrollChatBottom();
    }
};

function appendRecievedMessage(msg) {
    if (msg) {
        const item = document.createElement('li');
        item.className = "recievedMessage";
        item.textContent = msg;
        messageList.appendChild(item);
        scrollChatBottom();
    }
};

function appendTimer() {
    const item = document.createElement('li');
    item.className = "timer"
    item.textContent = "New chat in: 03";
    messageList.appendChild(item);
    scrollChatBottom();
    return item;
};

function scrollChatBottom() {
    messageList.scrollTop = messageList.scrollHeight; /*https://stackoverflow.com/questions/270612/scroll-to-bottom-of-div */
};

function enableLoaderAnimation() {
    remoteVideo.style.display = "none";
    loader.style.display = "block";
};

function disableLoaderAnimation() {
    remoteVideo.style.display = "block";
    loader.style.display = "none";
};