const sound = document.querySelector("#sound");
const button = document.querySelector("#sound-toggle");
const menu = document.querySelector("#volume-menu");
const slider = document.querySelector("#volume");
let context;
let volume = Number(localStorage.cubeFighterVolume ?? 1);

if (!Number.isFinite(volume)) volume = 1;
volume = Math.max(0, Math.min(1, volume));
slider.value = volume * 100;

function updateButton() {
  button.classList.toggle("muted", !volume);
  button.setAttribute("aria-label", `Volume ${slider.value}%`);
}

function audioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (AudioContext) return context ||= new AudioContext();
}

function unlock() {
  const audio = audioContext();
  if (audio?.state === "suspended") audio.resume();
}

function tone(from, to = from, time = .05, type = "sine", gain = .02, delay = 0) {
  if (!volume) return;
  const audio = audioContext();
  if (!audio) return;
  const play = () => {
    const start = audio.currentTime + delay;
    const oscillator = audio.createOscillator();
    const envelope = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + time);
    envelope.gain.setValueAtTime(Math.min(gain * 12 * volume, .95), start);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + time);
    oscillator.connect(envelope).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + time);
  };
  if (audio.state === "suspended") audio.resume().then(play).catch(() => {});
  else play();
}

export const fx = {
  step: () => tone(280, 210, .04, "sine", .045),
  wall: () => tone(160, 110, .05, "triangle", .06),
  wait: () => tone(220, 160, .055, "sine", .035),
  turn: () => tone(190, 140, .035, "triangle", .022),
  kill: () => {
    tone(360, 540, .055, "triangle", .07);
    tone(720, 900, .065, "sine", .04, .025);
  },
  die: () => tone(240, 65, .28, "triangle", .09),
  clear: () => {
    tone(330, 330, .05, "sine", .04, .06);
    tone(440, 440, .05, "sine", .04, .12);
    tone(660, 660, .08, "triangle", .05, .18);
  }
};

function show(open) {
  menu.hidden = !open;
  button.setAttribute("aria-expanded", open);
  if (open) slider.focus();
}

button.addEventListener("click", () => show(menu.hidden));
slider.addEventListener("input", () => {
  volume = slider.value / 100;
  localStorage.cubeFighterVolume = volume;
  updateButton();
});
addEventListener("click", event => {
  if (!sound.contains(event.target)) show(false);
});
addEventListener("keydown", event => {
  if (event.key === "Escape") show(false);
});
addEventListener("pointerdown", unlock, {once: true});
addEventListener("keydown", unlock, {once: true});
updateButton();
