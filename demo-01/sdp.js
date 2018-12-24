module.exports = function ({
  originator = '-',
  sessionId = `${Math.round(Math.random() * 10e10)}${
    Math.round(Math.random() * 10e10)}`,
  sessionVersion = 0,
  networkAddress = 'IN IP4 127.0.0.1',
  sessionName = '-',
  timeStart = 0,
  timeEnd = 0,
  connectionAddress = 'IN IP4 127.0.0.1',
  audioPort = 0,
  videoPort = 0,
  profile = 'RTP/AVP'

}, ...rtpParameters) {

  let sdp = '';

  sdp += `v=0\n`;
  sdp += `o=${originator} ${sessionId} ${sessionVersion} ${networkAddress}\n`;
  sdp += `s=${sessionName}\n`;
  sdp += `t=${timeStart} ${timeEnd}\n`;
  sdp += `c=${connectionAddress}\n`;

  let rtpParametersWithMid = [];
  let descs = [];
  let mids = [];

  for (const _rtpParameters of rtpParameters) {
    const { codecs: [{ mimeType }] } = _rtpParameters;

    if (/^audio/.test(mimeType)) {
      rtpParametersWithMid.push({
        mid: 'audio',
        ..._rtpParameters
      });
      continue;
    }
    if (/^video/.test(mimeType)) {
      rtpParametersWithMid.push({
        mid: 'video',
        ..._rtpParameters
      });
      continue;
    }
  }

  for (const {
    mid,
    codecs,
    headerExtensions,
    encodings,
    rtcp

  } of rtpParametersWithMid) {

    if (mid !== 'audio' && mid !== 'video') continue;

    let desc = '';
    let payloadTypes = [];

    for (const ext of headerExtensions) {
      desc += `a=extmap:${ext.id} ${ext.uri}\n`;
    }

    desc += `a=sendrecv\n`;

    if (rtcp.mux) {
      desc += `a=rtcp-mux\n`;
    }

    if (rtcp.reducedSize) {
      desc += `a=rtcp-rsize\n`;
    }

    for (const codec of codecs) {
      desc += `a=rtpmap:${codec.payloadType} ${codec.name}/${codec.clockRate}`;

      if (codec.channels) {
        desc += `/${codec.channels}`;
      }

      desc += `\n`;
      desc += `a=rtcp-fb:${codec.payloadType} transport-cc\n`;

      if (codec.rtcpFeedback) {
        for (const fb of codec.rtcpFeedback) {
          desc += `a=rtcp-fb:${fb.type}`;

          if (fb.parameter) {
            desc += ` ${fb.parameter}`;
          }

          desc += `\n`;
        }
      }

      let params = codec.parameters && Object.keys(codec.parameters)
        .map(key => `${key}=${codec.parameters[key]}`)
        .join(';');

      if (params) {
        desc += `a=fmtp:${codec.payloadType} ${params}\n`;
      }

      payloadTypes.push(codec.payloadType);
    }

    for (const encoding of encodings) {
      if (encoding.rtx) {
        desc += `a=ssrc-group:FID ${encoding.ssrc} ${encoding.rtx.ssrc}\n`;
        desc += `a=ssrc:${encoding.ssrc} cname:${rtcp.cname}\n`;
        desc += `a=ssrc:${encoding.rtx.ssrc} cname:${rtcp.cname}\n`;

      } else {
        desc += `a=ssrc:${encoding.ssrc} cname:${rtcp.cname}\n`;
      }
    }

    if (mid === 'audio') {
      let pre = '';

      pre += `m=${mid} ${audioPort} ${profile} ${payloadTypes.join(' ')}\n`;
      pre += `a=mid:${mid}\n`;

      descs.push(pre + desc);

    } else if (mid === 'video') {
      let pre = '';

      pre += `m=${mid} ${videoPort} ${profile} ${payloadTypes.join(' ')}\n`;
      pre += `a=mid:${mid}\n`;

      descs.push(pre + desc);

    } else {
      // never
    }

    mids.push(mid);
  }

  if (mids.length > 1) {
    sdp += `a=group:BUNDLE ${mids.join(' ')}\n`;
  }

  sdp += descs.join('');

  return sdp;
}
