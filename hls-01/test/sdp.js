const sdp = require('../sdp');
const rtpParameters = require('./rtpParameters.json');

console.log(sdp({}, ...rtpParameters));
