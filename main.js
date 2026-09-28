import { Midi } from "@tonejs/midi";

const midiSelect = document.getElementById("midi-select");
let midi;

let ticks = 0;
let ticksPerSecond;
let pixelsPerTick = 0.1;
let notes = [];

const piano = document.getElementById("piano");
const noteArea = document.getElementById("piano");
const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const blackNotes = ["C#", "D#", "F#", "G#", "A#"]

function createPiano() {
  piano.appendChild(createOctave(3))
  piano.appendChild(createOctave(4))
  piano.appendChild(createOctave(5))
  piano.appendChild(createOctave(6))
  piano.appendChild(createOctave(7))
}

function createOctave(number) {
  const octave = document.createElement("div");
  octave.dataset.octave = number;
  for (let i = 0; i < noteNames.length; i++) {
    const key = document.createElement("div");

    key.classList.add("key");
    if (blackNotes.includes(noteNames[i])) {
      key.classList.add("black");
    }
    if (!blackNotes.includes(noteNames[i - 1])) {
      key.classList.add("outline-key")
    }

    key.dataset.note = noteNames[i];
    key.dataset.octave = number;
    key.dataset.midi = (number + 1) * 12 + i;
    octave.appendChild(key);
  }
  return octave;
}
createPiano();

function createNote(note) {
  const key = document.querySelector(`.key[data-midi="${note.midi}"]`);
  if (!key) return;

  const noteElement = document.createElement("div");
  noteElement.classList.add("note");

  noteElement.style.left = `${key.getBoundingClientRect().left - piano.getBoundingClientRect().left}px`;
  noteElement.style.top = -note.ticks - note.durationTicks * pixelsPerTick + "px";
  noteElement.style.width = key.clientWidth + 1 + "px";
  noteElement.style.height = note.durationTicks * pixelsPerTick + "px";
  noteElement.onclick = () => {
    alert(note.ticks + " " + note.durationTicks);
  }

  noteArea.appendChild(noteElement);
  notes.push(noteElement);
}

midiSelect.addEventListener("load", loadMidi);
midiSelect.addEventListener("change", loadMidi);

async function loadMidi() {
  const file = midiSelect.files[0];

  if (!file) return;

  const arrayBuffer = await file.arrayBuffer();
  midi = new Midi(arrayBuffer);

  start();
}

function start() {
  const ppq = midi.header.ppq;
  const bpm = midi.header.tempos[0].bpm;
  ticksPerSecond = ppq * bpm / 60;

  for (let i in midi.tracks[1].notes) {
    createNote(midi.tracks[1].notes[i]);
  }

  requestAnimationFrame(update);
}

let lastTime = performance.now();
function update(time) {
  const deltaTime = (time - lastTime) / 1000;
  lastTime = time;

  ticks += deltaTime * ticksPerSecond;
  document.getElementById("ticks").innerHTML = ticks;
  for (let i in notes) {
    const top = parseFloat(notes[i].style.top);
    notes[i].style.top =
      `${parseFloat(notes[i].style.top) + deltaTime * ticksPerSecond * pixelsPerTick}px`;
  }

  requestAnimationFrame(update);
}
