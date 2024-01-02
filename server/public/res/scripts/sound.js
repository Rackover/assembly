
const sound = {};

sound.bop = new Audio();
sound.bop.src = "res/sound/bop.ogg";
sound.bop.mozPreservesPitch = false;
sound.bop.webkitPreservesPitch = false;
sound.bop.preservesPitch = false;

sound.boom = new Audio();
sound.boom.src = "res/sound/boom.ogg";


sound.playBop = function (pitch = 1) {
    return;
// doesnt work
    sound.bop.playbackRate = pitch;
    sound.bop.play();
}

sound.playBoom = function () {
    sound.boom.play();
}
