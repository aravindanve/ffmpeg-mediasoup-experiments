const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const createHttpsServer = require('https').createServer;
const createUdpSocket = require('dgram').createSocket;
const createMediaServer = require('mediasoup').Server;
const createIO = require('socket.io');
const express = require('express');
const config = require('./config');
const generateSdp = require('./sdp');

const cleanExit = () => {
  console.log('\nReceived SIGINT or SIGTERM');

  // TODO: ffmpeg doesn't exit properly
  // it errors with `pipe:: Operation timed out`
  // then exits with `Exiting normally, received signal 2.`
  destroyAllTranscoders(() => {
    console.log('Closed all transcoders, exiting...');
    process.exit(0);
  });
};

process.on('SIGINT', cleanExit);
process.on('SIGTERM', cleanExit);

const serverOptions = {
  key: fs.readFileSync(path.resolve(config.tlsKeyFile)),
  cert: fs.readFileSync(path.resolve(config.tlsCertFile))
};

const staticListener = express().use(express.static(config.staticDir));
const httpsServer = createHttpsServer(serverOptions, staticListener);
const mediaServer = createMediaServer(config.mediaServerOptions);
const io = createIO(httpsServer, config.ioOptions);
const room = mediaServer.Room(config.mediaCodecs);

const NOOP = () => {};

const getUdpPort = cb => {
  const socket = createUdpSocket(config.udpSocketType);

  socket.bind(err => {
    if (err) return cb(err);

    const address = socket.address();

    socket.close();
    setImmediate(cb, null, address.port);
  });
};

const generateSessionId = () => {
  return `${Date.now()}` + `${Math.floor(
    Math.random() * 10e6)}`.padStart(7, '0');
};

const transcoders = new Map();
const initTranscoder = (outDir, sdp) => {
  const ffprocess = childProcess.spawn('ffmpeg', [
    ...config.ffmpeg.args,
    '-hls_segment_filename', `${outDir}/360p_%06d.ts`,
    `${outDir}/playlist.m3u8`

  ], {
    cwd: __dirname,
    stdio: ['pipe', process.stdout, process.stderr],
    detached: true,
    shell: false
  });

  transcoders.set(ffprocess, true);

  ffprocess.on('error', err => {
    console.log('FFPROCESS ERROR', err);
  });

  ffprocess.stdin.write(sdp);
  ffprocess.stdin.end();
  // ffprocess.unref();

  return ffprocess;
};

const destroyTranscoder = ffprocess => {
  if (transcoders.delete(ffprocess)) {
    ffprocess.kill('SIGINT');
  }
};

const destroyAllTranscoders = (cb) => {
  const num = transcoders.size;

  if (!num) return cb();

  let count = 0;
  const onExit = () => {
    if (++count >= num) return cb();
  };

  for (const transcoder of transcoders.keys()) {
    transcoder.once('exit', onExit);
    transcoder.kill('SIGINT');
  }
  transcoders.clear();
};

const initStreamer = (socket, producer) => {
  const streamers = socket.streamers = socket.streamers || [];

  getUdpPort((err, port) => {
    if (err) {
      console.log('(get-udp-port) ERROR', err);
      return;
    }

    const sessionId = socket.ff
      ? socket.ff.sessionId
      : generateSessionId();

    const sessionVersion = socket.ff
      ? socket.ff.sessionVersion + 1 : 0;

    const outDir = `${config.ffmpeg.outDir}/${
      sessionId}-${sessionVersion}`;

    childProcess.execFile('mkdir', ['-p', outDir], {
      cwd: __dirname,
      shell: false

    }, err => {
      if (err) {
        console.log('(mkdir) ERROR', err);
        return;
      }

      room.createRtpStreamer(producer, {
        ...config.rtpStreamerOptions,
        remotePort: port
      })
        .then(streamer => {
          streamer.__port = port;
          streamers.push(streamer);

          let audioStreamer;
          let videoStreamer;

          for (let i = 0; i < streamers.length; i++) {
            if (audioStreamer && videoStreamer) break;
            if (streamers[i].consumer.kind === 'audio') {
              audioStreamer = streamers[i];
            }
            if (streamers[i].consumer.kind === 'video') {
              videoStreamer = streamers[i];
            }
          }

          if (socket.ff && socket.ff.ffprocess) {
            destroyTranscoder(socket.ff.ffprocess);
            socket.ff.ffprocess = undefined;
          }

          const rtpParameters = [];

          let audioPort;
          let videoPort;

          if (audioStreamer) {
            audioPort = audioStreamer.__port;
            rtpParameters.push(audioStreamer.consumer.rtpParameters);
          }

          if (videoStreamer) {
            videoPort = videoStreamer.__port;
            rtpParameters.push(videoStreamer.consumer.rtpParameters);
          }

          console.log('rtp', {
            sessionId,
            sessionVersion,
            streams: rtpParameters.length,
            audioPort,
            videoPort
          });
          console.log('rtpParameters', rtpParameters);

          // (re)generate sdp
          const sdp = generateSdp({
            sessionId,
            sessionVersion,
            audioPort,
            videoPort,

          }, ...rtpParameters);

          console.log('SDP:\n', sdp);

          socket.ff = {
            sessionId,
            sessionVersion,
            ffprocess: initTranscoder(outDir, sdp)
          };
        })
        .catch(err =>
          console.log('(streamer) ERROR', err));
    });
  });
};

const clearStreamers = socket => {
  if (socket.ff) {
    socket.ff.sessionId = undefined;
    socket.ff.sessionVersion = undefined;
  }
  if (socket.ff && socket.ff.ffprocess) {
    destroyTranscoder(socket.ff.ffprocess);
    socket.ff.ffprocess = undefined;
  }
  socket.streamers = undefined;
};

const initPeer = socket => {
  const peer = socket.peer = room.getPeerByName(socket.id);

  peer.on('notify', notification =>
    socket.emit('notification', notification));

  peer.on('newproducer', producer =>
    initStreamer(socket, producer));

  peer.on('error', err =>
    console.log('(peer) ERROR', peer.name, err));

  peer.on('close', () => {
    clearStreamers(socket);
    socket.peer = undefined;
  });
};

const handleMediaRequest = (socket, request, resolve, reject) => {
  switch (request.method) {
    case 'queryRoom':
      room.receiveRequest(request)
      .then(resolve)
      .catch(reject);
      break;

    case 'join':
      if (request.peerName !== socket.id) {
        reject('invalid peer name');
        break;
      }
      if (socket.peer) {
        reject('already joined');
        break;
      }
      room.receiveRequest(request)
        .then(response => {
          resolve(response);
          initPeer(socket);
        })
        .catch(reject);
      break;

    default:
      if (!socket.peer) {
        reject('not joined');
        break;
      }
      socket.peer.receiveRequest(request)
        .then(resolve)
        .catch(reject);
      break;
  }
};

const handleMediaNotification = (socket, notification) => {
  if (!socket.peer) return;
  socket.peer.receiveNotification(notification);
};

const handleIoConnect = socket => {
  socket.on('request', (payload, ack = NOOP) =>
    handleMediaRequest(
      socket,
      payload,
      data => ack({ data }),
      error => ack({ error })));

  socket.on('notification', (payload, ack = NOOP) =>
    handleMediaNotification(
      socket,
      payload,
      ack()));

  socket.on('disconnect', () => {
    if (socket.peer && !socket.peer.closed) {
      socket.peer.close();
    }
  });

  socket.emit('peername', socket.id);
};

const handleRoomError = err =>
  console.log('(room) ERROR', err);

const handleIoError = err =>
  console.log('(io) ERROR', err);

const handleHttpListening = () =>
  console.log(`(https) listening on ${config.host}:${config.port}`);

// handlers
io.on('connect', handleIoConnect);
io.on('error', handleIoError);
room.on('error', handleRoomError);
httpsServer.on('listening', handleHttpListening);

// bind
httpsServer.listen(config.port, config.host);
