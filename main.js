import { Midi } from "@tonejs/midi";

const midiSelect = document.getElementById("midi-select");
let Tone;
let synth;
let midi;

let ticks = 0;
let ticksPerSecond;
let pixelsPerTick = 1;
let notes = [];

const piano = document.getElementById("piano");
const noteArea = document.getElementById("piano");
const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const blackNotes = ["C#", "D#", "F#", "G#", "A#"]

function createPiano() {
  piano.appendChild(createOctave(1))
  piano.appendChild(createOctave(2))
  piano.appendChild(createOctave(3))
  piano.appendChild(createOctave(4))
  piano.appendChild(createOctave(5))
  piano.appendChild(createOctave(6))
  piano.appendChild(createOctave(7))
  piano.appendChild(createOctave(8))
  piano.appendChild(createOctave(9))
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
  noteElement.style.top = (-note.ticks - note.durationTicks) * pixelsPerTick + "px";
  noteElement.style.width = key.clientWidth + 2 + "px";
  noteElement.style.height = (note.durationTicks - 2) * pixelsPerTick + "px";
  noteElement.dataset.ticks = note.ticks;
  noteElement.dataset.duration = note.durationTicks;
  noteElement.midi = note.midi;
  noteElement.played = false;
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
}

document.getElementById("play").addEventListener("click", async () => {
  if (!midi) return;

  Tone = await import("tone");

  await Tone.start();

  if (!synth) {
    synth = new Tone.PolySynth(Tone.Synth).toDestination();
  }

  start();
});

function start() {
  ticks = 0;

  notes.forEach(note => note.remove());
  notes = [];

  lastTime = performance.now();
  const ppq = midi.header.ppq;
  const bpm = midi.header.tempos[0].bpm;
  ticksPerSecond = ppq * bpm / 60;

  for (let i in midi.tracks) {
    for (let x in midi.tracks[i].notes) {
      createNote(midi.tracks[i].notes[x]);
    }
  }


  requestAnimationFrame(update);
}

let lastTime = performance.now();
function update(time) {
  const deltaTime = (time - lastTime) / 1000;
  lastTime = time;

  ticks += deltaTime * ticksPerSecond;
  document.getElementById("ticks").innerHTML = notes.length;
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i];
    note.style.top = `${parseFloat(note.style.top) + deltaTime * ticksPerSecond * pixelsPerTick}px`;

    if (!note.played && ticks >= note.dataset.ticks && note.dataset.duration > 0) {
      note.played = true;

      synth.triggerAttackRelease(
        Tone.Frequency(note.midi, "midi"),
        note.dataset.duration / ticksPerSecond
      );
    }

    if (Number(note.dataset.duration) + Number(note.dataset.ticks) < ticks) {
      note.remove();
      notes.splice(i, 1);
    }
  }

  requestAnimationFrame(update);
}
