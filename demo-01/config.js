module.exports = {
  host: 'localhost',
  port: 9000,
  tlsKeyFile: './tls/key.pem',
  tlsCertFile: './tls/cert.pem',
  staticDir: './client/dist/',
  ioOptions: {
    serveClient: false
  },
  udpSocketType: 'udp4',
  udpSocketOptions: {
    address: 'localhost',
    port: 9002,
    exclusive: true
  },
  udpSocketOptions: {
    address: 'localhost',
    port: 9002,
    exclusive: true
  },
  mediaServerOptions: {
    numWorkers: null,
    rtcIPv4: true,
    rtcIPv6: false,
    rtcAnnouncedIPv4: undefined,
    rtcAnnouncedIPv6: undefined,
    rtcMinPort: undefined,
    rtcMaxPort: undefined
  },
  mediaServerEnableStats: false,
  mediaServerStatsInterval: 5000,
  rtpStreamerOptions: {
    remoteIP: '127.0.0.1'
  },
  mediaCodecs: [
    {
      kind: 'audio',
      name: 'opus',
      clockRate: 48000,
      channels: 2,
      parameters: {
        useinbandfec: 1
      }
    },
    {
      kind: 'video',
      name: 'VP8',
      clockRate: 90000
    },
    {
      kind: 'video',
      name: 'H264',
      clockRate: 90000,
      parameters: {
        'packetization-mode': 1
      }
    }
  ],
  ffmpeg: {
    args: [
      '-protocol_whitelist', 'pipe,file,crypto,udp,rtp',
      '-i', '-',
      '-vcodec', 'copy'
    ],
    outDir: './output'
  }
};
