'use strict';

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;

////////////////////// STUN & TURN ///////////////////////

var iceConfig = { 'iceServers': [

  {"url": "stun:stun.l.google.com:19302"},

  {"url": "turn:104.199.135.205:3478?transport=udp",

  "username":"1481095905:41784574",

  "credential":"FNn4ncifaQ8tt6ImdGjy/uxYVxE="},

  {"url": "turn:104.199.135.205:3478?transport=tcp",

  "username":"1481095905:41784574",

  "credential":"FNn4ncifaQ8tt6ImdGjy/uxYVxE="},

  {"url": "turn:104.199.135.205:3479?transport=udp",

  "username":"1481095905:41784574",

  "credential":"FNn4ncifaQ8tt6ImdGjy/uxYVxE="},

  {"url": "turn:104.199.135.205:3479?transport=tcp",

  "username":"1481095905:41784574",

  "credential":"FNn4ncifaQ8tt6ImdGjy/uxYVxE="},

]};

// requestTurn(
//   'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
// );


// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  'mandatory': {
    'OfferToReceiveAudio': true,
    'OfferToReceiveVideo': true
  }
};

////////////////////// Create Room ///////////////////////

// var room = 'foo';
// Could prompt for room name:
var room = prompt('Enter room name:');

var socket = io.connect();

if (room !== '') {
  socket.emit('create or join', room);
  console.log('Attempted to create or  join room', room);
}

socket.on('created', function(room) {
  console.log('Created room ' + room);
  isInitiator = true;
});

socket.on('full', function(room) {
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (room){
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', function(room) {
  console.log('joined: ' + room);
  isChannelReady = true;
});

socket.on('log', function(array) {
  console.log.apply(console, array);
});

////////////////////// Emite Message to socket ///////////////////////

function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

////////////////////// Recieve msg from socket ///////////////////////

// This client receives a message
socket.on('message', function(message) {
  console.log('Client received message:', message);
  if (message === 'got user media') {
    maybeStartCall();
  } else if (message.type === 'offer') {
    if (!isInitiator && !isStarted) {
      maybeStartCall();
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer' && isStarted) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' && isStarted) {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    pc.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});

////////////////////// getUserMedia ///////////////////////

var localVideo = document.getElementById('localVideo');
var remoteVideo = document.getElementById('remoteVideo');

var constraints = {
    video: {
      mandatory: {
        maxWidth: 640, minWidth: 640,
        // maxWidth: 1280, minWidth: 1280,

        maxHeight: 360, minHeight: 360,
        // maxHeight: 720, minHeight: 720,        
        
        // minFrameRate: 30, maxFrameRate: 30
        minFrameRate: 5, maxFrameRate: 5
      }
    },
    audio: true
  };

console.log('Getting user media with constraints', constraints);

navigator.mediaDevices.getUserMedia(constraints)
.then(gotStream)
.catch(function(e) {
  alert('getUserMedia() error: ' + e.name);
});

function gotStream(stream) {
  console.log('Adding local stream.');
  localVideo.src = window.URL.createObjectURL(stream);
  localStream = stream;
  sendMessage('got user media');
  if (isInitiator) {
    maybeStartCall();
  }
}

////////////////////// Start Call ///////////////////////

function maybeStartCall() {
  console.log('>>>>>>> maybeStartCall() ', isStarted, localStream, isChannelReady);
  if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection();
    pc.addStream(localStream);
    isStarted = true;
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall();
    }
  }
}

////////////////////// Create peer ///////////////////////

function createPeerConnection() {
  try {
    // pc = new RTCPeerConnection(null);
    pc = new RTCPeerConnection(iceConfig);
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = handleRemoteStreamRemoved;
    console.log('Created RTCPeerConnnection');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

function handleIceCandidate(event) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    console.log('End of candidates.');
  }
}

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteVideo.src = window.URL.createObjectURL(event.stream);
  remoteStream = event.stream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

////////////////////// create Offer and Answer ///////////////////////
function doCall() {
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
  console.log('Sending answer to peer.');
  pc.createAnswer().then(
    setLocalAndSendMessage,
    onCreateSessionDescriptionError
  );
}

function setLocalAndSendMessage(sessionDescription) {
  // Set Opus as the preferred codec in SDP if Opus is present.
  //  sessionDescription.sdp = preferOpus(sessionDescription.sdp);
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message', sessionDescription);
  sendMessage(sessionDescription);
}

function handleCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}


// function hangup() {
//   console.log('Hanging up.');
//   stop();
//   sendMessage('bye');
// }
////////////////////// Reload to End Call ///////////////////////

window.onbeforeunload = function() {
  sendMessage('bye');
};

function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
  isInitiator = false;
}

function stop() {
  isStarted = false;
  // isAudioMuted = false;
  // isVideoMuted = false;
  pc.close();
  pc = null;
}

///////////////////////////////////////////

// Set Opus as the default audio codec if it's present.
// function preferOpus(sdp) {
//   var sdpLines = sdp.split('\r\n');
//   var mLineIndex;
//   // Search for m line.
//   for (var i = 0; i < sdpLines.length; i++) {
//     if (sdpLines[i].search('m=audio') !== -1) {
//       mLineIndex = i;
//       break;
//     }
//   }
//   if (mLineIndex === null) {
//     return sdp;
//   }

//   // If Opus is available, set it as the default in m line.
//   for (i = 0; i < sdpLines.length; i++) {
//     if (sdpLines[i].search('opus/48000') !== -1) {
//       var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
//       if (opusPayload) {
//         sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex],
//           opusPayload);
//       }
//       break;
//     }
//   }

//   // Remove CN in m line and sdp.
//   sdpLines = removeCN(sdpLines, mLineIndex);

//   sdp = sdpLines.join('\r\n');
//   return sdp;
// }

// function extractSdp(sdpLine, pattern) {
//   var result = sdpLine.match(pattern);
//   return result && result.length === 2 ? result[1] : null;
// }

// // Set the selected codec to the first in m line.
// function setDefaultCodec(mLine, payload) {
//   var elements = mLine.split(' ');
//   var newLine = [];
//   var index = 0;
//   for (var i = 0; i < elements.length; i++) {
//     if (index === 3) { // Format of media starts from the fourth.
//       newLine[index++] = payload; // Put target payload to the first.
//     }
//     if (elements[i] !== payload) {
//       newLine[index++] = elements[i];
//     }
//   }
//   return newLine.join(' ');
// }

// // Strip CN from sdp before CN constraints is ready.
// function removeCN(sdpLines, mLineIndex) {
//   var mLineElements = sdpLines[mLineIndex].split(' ');
//   // Scan from end for the convenience of removing an item.
//   for (var i = sdpLines.length - 1; i >= 0; i--) {
//     var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
//     if (payload) {
//       var cnPos = mLineElements.indexOf(payload);
//       if (cnPos !== -1) {
//         // Remove CN payload from m line.
//         mLineElements.splice(cnPos, 1);
//       }
//       // Remove CN line in sdp
//       sdpLines.splice(i, 1);
//     }
//   }

//   sdpLines[mLineIndex] = mLineElements.join(' ');
//   return sdpLines;
// }
