"use strict";
// Establish a websocket connection to server.
var ws = new WebSocket("wss://" + location.host + "/ws");

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const nextButton = document.getElementById('nextButton');
const autoNext = document.getElementById('autoNext');
const loader = document.getElementById('loaderWrap');
let localStream = null;

nextButton.textContent = "Next";

//Client identifier to be returned by signaling server.
let clientId = null;
const numPeers = 2;
const connectionState = false;

let connectionMap = new Map();

// Get user video/audio and set to localVideo element.
const mediaStreamConstraints = {
    audio: false,
    video: true
};

// Add STUN/TURN servers.
const configuration = {
    iceServers: [
        {
            urls: ["stun:stun.l.google.com:19302"]
        }
    ]
};

async function getUserMedia(constraints) {
    let stream = null;
  
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      localVideo.srcObject = stream;
      localStream = stream;
      nextButton.disabled = false;
      /* use the stream */
    } catch(err) {
      /* handle the error */
    }
}

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
}

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
}

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
        getUserMedia(mediaStreamConstraints);
    }
    else if (data['type'] === "chat") {
        const msg = data['message'];
        appendRecievedMessage(msg);
    }
    else if (data['type'] === "disconnect") {
        handleDisconnect();
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
                handleDisconnect();
                break;
            
            case "completed":
            case "connected":
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
    var countDown = setInterval(function () {
        minutes = parseInt(timer / 60, 10);
        seconds = parseInt(timer % 60, 10);

        minutes = minutes < 10 ? "0" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;

        display.textContent = "New chat in: " + seconds;

        if (--timer < 0) {
            clearInterval(countDown);
        }
    }, 1000);
}

function showTimer() {
    // const item = document.createElement('li');
    // item.textContent = "New chat in: 05";
    // messageList.appendChild(item);
    const item = appendTimer();
    startTimer(4, item);
}

function removeTimer() {
    var listItems = messageList.getElementsByTagName('li');
    var last = listItems[listItems.length - 1];
    messageList.removeChild(last);
}

function handleNextButtonClick() {
    // nextButton.textContent = "Next";
    if (connectionMap.size && !autoNext.checked) {
        nextButton.textContent = "Next";

        sendDisconnect();
        closeVideoCall();
    }
    else if (connectionMap.size && autoNext.checked) {
        nextButton.textContent = "Stop";

        sendDisconnect();
        closeVideoCall();
        // clearChat();

        showTimer();

        setTimeout(function() {
            if (nextButton.textContent === "Stop") {
                enableLoaderAnimation();
                clearChat();
                nextVideoChat();
            }
        }, 5000)
    }
    else if (!connectionMap.size) {
        if (nextButton.textContent === "Stop") {
            nextButton.textContent = "Next";
            disableLoaderAnimation();
            closeVideoCall();
            removeTimer();
            // clearChat();
        } else {
            nextButton.textContent = "Stop";
            enableLoaderAnimation();
            closeVideoCall();
            clearChat();
            nextVideoChat();
        }
    }
}

function handleDisconnect() {
    if (autoNext.checked) {
        nextButton.textContent = "Stop";
        closeVideoCall();
        showTimer();

        setTimeout(function() {
            if (nextButton.textContent === "Stop") {
                enableLoaderAnimation();
                clearChat();
                nextVideoChat();
            }
        }, 5000)
    }
    else {
        nextButton.textContent = "Next";
        closeVideoCall();
    }
}

function clearChat() {
    messageList.innerHTML = "";
}

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
}

//Next Button
nextButton.addEventListener('click', handleNextButtonClick);

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
}

function appendRecievedMessage(msg) {
    if (msg) {
        const item = document.createElement('li');
        item.className = "recievedMessage";
        item.textContent = msg;
        messageList.appendChild(item);
        scrollChatBottom();
    }
}

function appendTimer() {
    const item = document.createElement('li');
    item.className = "timer"
    item.textContent = "New chat in: 05";
    messageList.appendChild(item);
    scrollChatBottom();
    return item;
}

function scrollChatBottom() {
    messageList.scrollTop = messageList.scrollHeight; /*https://stackoverflow.com/questions/270612/scroll-to-bottom-of-div */
};

function enableLoaderAnimation() {
    remoteVideo.classList.replace('video', 'spinner-loader');
};

function disableLoaderAnimation() {
    remoteVideo.classList.replace('spinner-loader', 'video');
};

const messageList = document.getElementById("chatBox");
const textInput = document.getElementById("textInput");
const sendMessageButton = document.getElementById("sendMessageButton");

sendMessageButton.addEventListener("click", sendMessage);
textInput.addEventListener("keydown", enterKeyMessage);