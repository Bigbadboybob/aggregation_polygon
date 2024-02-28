const play = require('audio-play');
const load = require('audio-loader');

function playDing() {
    load('./src/audio/ding.mp3').then(play);
}
function playCash() {
    load('./src/audio/ding.mp3').then(play);
}

function playGameboy() {
    load('./src/audio/gameboy.mp3').then(play);
}
//playGameboy()

module.exports = {
    playDing, playCash, playGameboy
}