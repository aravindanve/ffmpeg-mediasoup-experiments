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
      // latency: ~32s on localhost
      '-debug', 'pict',
      '-protocol_whitelist', 'pipe,file,crypto,udp,rtp',
      '-i', '-',
      '-map:0', '0',
      // '-max_muxing_queue_size', '1000',
      '-crf', '23',
      '-preset', 'fast',
      '-codec:a', 'libfdk_aac',
      '-ar', '48000',
      '-b:a', '128k',
      '-codec:v', 'libx264',
      '-profile:v', 'high',
      '-level', '4.2',
      '-r', '24',
      '-b:v', '800k',
      '-maxrate', '1400k',
      '-bufsize', '600k',
      '-vf', 'scale=w=640:h=360:force_original_aspect_ratio=decrease',
      '-flags', '+cgop', '-g', '24', '-keyint_min', '24', '-sc_threshold', '0',
      '-hls_time', '3',
      '-hls_list_size', '8',
      // '-hls_flags', 'temp_file',
      '-hls_flags', 'delete_segments'
    ],
    outDir: './output'
  }
};
