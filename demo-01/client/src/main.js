const mediasoupClient = require('mediasoup-client');
const ioClient = require('socket.io-client');

const body = document.querySelector('body');
const room = new mediasoupClient.Room();
const socket = ioClient('/');

let recvTransport;
let sendTransport;
let peerName;
let publishButton;
let publishing = false;

let videoElementCount = 0;
function createVideoElement(remote = true, kind = 'audio') {
  const element = document.createElement('video');
  element.id = `video${++videoElementCount}_${remote ? 'remote' : 'local'}`;
  element.class = remote ? 'remote' : 'local';
  element.style = kind === 'video'
    ? (remote ? 'height: 720px;' : 'height: 120px;')
    : 'height: 0px;';
  element.style.position = 'relative';

  if (!remote) {
    element.muted = true;
  }

  element.oncanplay = e => queuePlay(element) &&
    console.log(element.id, 'canplay', e);

  element.onabort = e => console.log(element.id, 'abort', e);
  element.oncanplaythrough = e => console.log(element.id, 'canplaythrough', e);
  element.ondurationchange = e => console.log(element.id, 'durationchange', e);
  element.onemptied = e => console.log(element.id, 'emptied', e);
  element.onended = e => console.log(element.id, 'ended', e);
  element.onerror = e => console.log(element.id, 'error', e);
  element.onloadeddata = e => console.log(element.id, 'loadeddata', e);
  element.onloadedmetadata = e => console.log(element.id, 'loadedmetadata', e);
  element.onloadstart = e => console.log(element.id, 'loadstart', e);
  element.onpause = e => console.log(element.id, 'pause', e);
  element.onplay = e => console.log(element.id, 'play', e);
  element.onplaying = e => console.log(element.id, 'playing', e);
  element.onratechange = e => console.log(element.id, 'ratechange', e);
  element.onseeked = e => console.log(element.id, 'seeked', e);
  element.onseeking = e => console.log(element.id, 'seeking', e);
  element.onstalled = e => console.log(element.id, 'stalled', e);
  element.onsuspend = e => console.log(element.id, 'suspend', e);
  element.onvolumechange = e => console.log(element.id, 'volumechange', e);
  element.onwaiting = e => console.log(element.id, 'waiting', e);

  // NOTE: disabled to prevent flooding console
  // element.onprogress = e => console.log(element.id, 'progress', e);
  // element.ontimeupdate = e => console.log(element.id, 'timeupdate', e);

  return element;
}

const canPlay = [];
let overlay;

function queuePlay(element) {
  element.play().catch(() => {
    if (overlay) return;

    canPlay.push(element);

    overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.4)';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.left = '0';
    overlay.style.color = '#fff';
    overlay.style.textAlign = 'center';
    overlay.style.verticalAlign = 'middle';
    overlay.style.zIndex = '999';
    overlay.style.padding = '15px';
    overlay.style.fontFamily = 'sans-serif';
    overlay.innerText = 'Click to Play';

    document.body.appendChild(overlay);
    document.onclick = () => {
      document.onclick = undefined;
      overlay.remove();
      overlay = undefined;

      while (canPlay.length) {
        canPlay.shift().play();
      }
    };
  });

  return true;
}

function cancelPlay(element) {
  const index = canPlay.indexOf(element);

  if (index > -1) canPlay.splice(index, 1);

  if (overlay && !canPlay.length) {
    document.onclick = undefined;
    overlay.remove();
    overlay = undefined;
  }

  return true;
}

function handleConsumer(consumer) {
  console.log('handleConsumer', consumer);
  const element = consumer.element = createVideoElement(true, consumer.kind);
  const stream = new MediaStream();
  element.srcObject = stream;

  consumer.receive(recvTransport).then(track => {
    console.log('receiving a new remote MediaStreamTrack', track);
    stream.addTrack(track);
  });

  consumer.on('close', () => {
    console.log('Consumer closed');
    consumer.element &&
      cancelPlay(consumer.element) &&
      consumer.element.remove();
  });

  body.appendChild(element);
}

function handlePeer(peer) {
  console.log('handlePeer', peer);
  for (const consumer of peer.consumers) {
    handleConsumer(consumer);
  }

  peer.on('close', () => {
    console.log('Peer closed');
  });

  peer.on('newconsumer', consumer => {
    console.log('Got a new Consumer');
    handleConsumer(consumer);
  });
}

function handlePublish() {
  console.log('handlePublish');
  publishButton.disabled = true;
  sendTransport = room.createTransport('send');
  navigator.mediaDevices.getUserMedia({
    audio: true,
    video: { width: { ideal: 1280 }, height: { ideal: 720 } }
  })
  .then(stream => {
    const element = createVideoElement(false, 'video');
    element.srcObject = stream;

    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];

    const audioProducer = room.createProducer(audioTrack);
    const videoProducer = room.createProducer(videoTrack);

    audioProducer.send(sendTransport)
      .then(() => console.log('publishing audio...'));

    videoProducer.send(sendTransport)
      .then(() => console.log('publishing video...'));

    publishButton.replaceWith(element);
    publishing = true;
  });
}

function leaveRoom() {
  body.innerHTML = '';
  delete room.currentPeerName;
  return room.leave();
}

function joinRoom() {
  room.currentPeerName = peerName;
  room.join(peerName).then(peers => {
    console.log('peers', peers);
    recvTransport = room.createTransport('recv');

    publishButton = document.createElement('button');
    publishButton.id = 'publish';
    publishButton.innerText = 'Publish';
    publishButton.onclick = handlePublish;

    body.insertBefore(document.createElement('br'), body.childNodes[0]);
    body.insertBefore(publishButton, body.childNodes[0]);

    for (const peer of peers) {
      handlePeer(peer);
    }

    // resume publishing on reconnection
    if (publishing) {
      handlePublish();
    }
  });
}

function safeJoinRoom() {
  let chain = Promise.resolve(true);

  if (room.currentPeerName) {
    chain = chain.then(leaveRoom);
  }

  chain
    .then(joinRoom)
    .catch(err => console.error('JOIN error', err));
}

// room events
room.on('newpeer', peer => {
  console.log('room:newpeer', peer);
  handlePeer(peer);
});

room.on('request', (request, callback, errback) => {
  console.log('room:request', request);
  socket.emit('request', request, ({ error, data }) => error
    ? errback(error) : callback(data));
});

room.on('notify', notification => {
  console.log('room:notify', notification);
  socket.emit('notification', notification);
});

// socket events
socket.on('notification', payload => {
  console.log('socket:notification', payload);
  room.receiveNotification(payload);
});

socket.on('connect', () => {
  console.log('socket connected');
});

socket.on('connect_error', err => {
  console.error('socket connect error', err);
});

socket.on('peername', payload => {
  console.log('socket:peername', payload);
  peerName = payload;
  safeJoinRoom();
});
