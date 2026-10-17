
import { Midi } from "@tonejs/midi";

const midiSelect = document.getElementById("midi-select");
const piano = document.getElementById("piano");
const noteArea = document.getElementById("notes");
const playButton = document.getElementById("play");
const ticksDisplay = document.getElementById("ticks");

const noteNames = [
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B"
];

const blackNotes = new Set(["C#", "D#", "F#", "G#", "A#"]);

const TRACK_COLORS = [
  "deepskyblue",
  "crimson",
  "darkorchid",
  "lawngreen",
  "orange",
  "dodgerblue"
];

// Visual speed in pixels per second.
// 200px/s is approximately your original speed at 100 BPM.
const PIXELS_PER_SECOND = 200;
const PIANO_HEIGHT = 150;

let Tone;
let synth;
let midi = null;

let animationFrame = null;
let playbackStart = 0;
let isPlaying = false;
let scheduledNotes = [];
let visualNotes = [];
let activeKeys = new Map();
let keyElements = new Map();

// --------------------------------------------------
// PIANO GENERATION
// --------------------------------------------------

function createPiano() {
  piano.replaceChildren();
  keyElements.clear();

  // Seven octaves: MIDI notes 36 through 119.
  for (let octaveNumber = 2; octaveNumber <= 8; octaveNumber++) {
    const octave = document.createElement("div");
    octave.dataset.octave = octaveNumber;

    for (let i = 0; i < noteNames.length; i++) {
      const name = noteNames[i];
      const midiNumber = (octaveNumber + 1) * 12 + i;

      const key = document.createElement("div");
      key.classList.add("key");

      if (blackNotes.has(name)) {
        key.classList.add("black");
      }

      // Add the outline to white keys, not black keys.
      if (!blackNotes.has(name)) {
        key.classList.add("outline-key");
      }

      key.dataset.note = name;
      key.dataset.octave = octaveNumber;
      key.dataset.midi = midiNumber;

      octave.appendChild(key);
      keyElements.set(midiNumber, key);
    }

    piano.appendChild(octave);
  }
}

createPiano();

// --------------------------------------------------
// MIDI LOADING
// --------------------------------------------------

midiSelect.addEventListener("change", loadMidi);

async function loadMidi() {
  const file = midiSelect.files?.[0];

  if (!file) return;

  stopPlayback();
  midi = null;
  noteArea.replaceChildren();

  playButton.disabled = true;

  try {
    const buffer = await file.arrayBuffer();
    const loadedMidi = new Midi(buffer);

    if (!loadedMidi.tracks.some(track => track.notes.length > 0)) {
      throw new Error("This MIDI file contains no playable notes.");
    }

    midi = loadedMidi;

    playButton.disabled = false;

    ticksDisplay.textContent =
      `${midi.tracks.reduce((sum, track) => sum + track.notes.length, 0)} notes loaded`;
  } catch (error) {
    console.error("Failed to load MIDI:", error);
    ticksDisplay.textContent = `Could not load MIDI: ${error.message}`;
  }
}

// --------------------------------------------------
// AUDIO INITIALIZATION
// --------------------------------------------------

playButton.addEventListener("click", async () => {
  if (!midi) return;

  try {
    playButton.disabled = true;

    if (!Tone) {
      Tone = await import("tone");
    }

    await Tone.start();

    if (!synth) {
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: {
          type: "triangle"
        },
        envelope: {
          attack: 0.005,
          decay: 0.1,
          sustain: 0.7,
          release: 0.15
        }
      }).toDestination();
    }

    startPlayback();
  } catch (error) {
    console.error("Playback failed:", error);
    ticksDisplay.textContent = `Playback error: ${error.message}`;
  } finally {
    playButton.disabled = false;
  }
});

// --------------------------------------------------
// PLAYBACK SETUP
// --------------------------------------------------

function startPlayback() {
  stopPlayback();

  if (!midi || !Tone || !synth) return;

  noteArea.replaceChildren();
  visualNotes = [];
  scheduledNotes = [];

  const areaHeight = Math.max(
    0,
    noteArea.clientHeight || window.innerHeight - PIANO_HEIGHT
  );

  const allNotes = [];

  for (let trackIndex = 0; trackIndex < midi.tracks.length; trackIndex++) {
    const track = midi.tracks[trackIndex];
    const color = TRACK_COLORS[trackIndex % TRACK_COLORS.length];

    for (const note of track.notes) {
      allNotes.push({
        midi: note.midi,
        time: note.time,
        duration: note.duration,
        color
      });
    }
  }

  allNotes.sort((a, b) => a.time - b.time);

  const audioContext = Tone.getContext();
  const startAt = audioContext.currentTime + 0.1;

  playbackStart = startAt;
  isPlaying = true;

  // Schedule audio against the audio clock, not animation frames.
  // note.time and note.duration are already expressed in seconds
  // by @tonejs/midi, including tempo changes in the MIDI file.
  for (const note of allNotes) {
    const startTime = startAt + note.time;
    const endTime = startTime + Math.max(0.01, note.duration);
    const frequency = Tone.Frequency(note.midi, "midi");

    synth.triggerAttack(frequency, startTime);
    synth.triggerRelease(frequency, endTime);

    scheduledNotes.push({
      ...note,
      startTime,
      endTime
    });

    createNote(note, areaHeight);
  }

  update();
}

// --------------------------------------------------
// FALLING NOTE VISUALS
// --------------------------------------------------

function createNote(note, areaHeight) {
  const key = keyElements.get(note.midi);

  // Don't render notes outside the generated piano range.
  if (!key) return;

  const element = document.createElement("div");
  element.classList.add("note");

  const height = Math.max(
    4,
    note.duration * PIXELS_PER_SECOND
  );

  // At the scheduled onset, the bottom of the note reaches
  // the bottom of the note area, directly above the piano.
  const top =
    areaHeight -
    (note.time * PIXELS_PER_SECOND) -
    height;

  element.style.left = `${key.offsetLeft + key.parentElement.offsetLeft}px`;
  element.style.top = `${top}px`;
  element.style.width = `${key.getBoundingClientRect().width}px`;
  element.style.height = `${height}px`;
  element.style.backgroundColor = note.color;

  noteArea.appendChild(element);

  visualNotes.push({
    element,
    midi: note.midi,
    time: note.time,
    duration: note.duration,
    endTime: note.time + note.duration
  });
}

// --------------------------------------------------
// ANIMATION AND KEY HIGHLIGHTS
// --------------------------------------------------

function update() {
  if (!isPlaying || !Tone) return;

  // Use the same audio clock that schedules the sound.
  const elapsed = Math.max(
    0,
    Tone.getContext().currentTime - playbackStart
  );

  for (const note of visualNotes) {
    const top =
      noteArea.clientHeight -
      (note.time + note.duration) * PIXELS_PER_SECOND +
      elapsed * PIXELS_PER_SECOND;

    note.element.style.transform = `translateY(${top - parseFloat(note.element.style.top)}px)`;

    const shouldBeActive =
      elapsed >= note.time && elapsed < note.endTime;

    if (shouldBeActive !== note.active) {
      note.active = shouldBeActive;
      changeKeyActivity(note.midi, shouldBeActive);
    }
  }

  // Remove notes only after their complete duration has passed.
  visualNotes = visualNotes.filter(note => {
    if (elapsed >= note.endTime) {
      note.element.remove();
      return false;
    }

    return true;
  });

  ticksDisplay.textContent = `${elapsed.toFixed(2)}s`;

  const songEnd = Math.max(
    0,
    ...scheduledNotes.map(note => note.endTime - playbackStart)
  );

  if (elapsed >= songEnd && visualNotes.length === 0) {
    stopPlayback();
    ticksDisplay.textContent = "Finished";
    return;
  }

  animationFrame = requestAnimationFrame(update);
}

// Track overlapping notes on the same key so one note ending
// doesn't turn off a key that another note is still playing.
function changeKeyActivity(midiNumber, shouldActivate) {
  const key = keyElements.get(midiNumber);
  if (!key) return;

  const count = activeKeys.get(midiNumber) || 0;

  if (shouldActivate) {
    activeKeys.set(midiNumber, count + 1);
    key.classList.add("active");
  } else {
    const nextCount = Math.max(0, count - 1);

    if (nextCount === 0) {
      activeKeys.delete(midiNumber);
      key.classList.remove("active");
    } else {
      activeKeys.set(midiNumber, nextCount);
    }
  }
}

// --------------------------------------------------
// STOP AND RESET
// --------------------------------------------------

function stopPlayback() {
  isPlaying = false;

  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  // Stop any remaining sound and scheduled events.
  if (synth && Tone) {
    synth.releaseAll();
  }

  for (const note of visualNotes) {
    note.element.remove();
  }

  visualNotes = [];
  scheduledNotes = [];
  activeKeys.clear();

  for (const key of keyElements.values()) {
    key.classList.remove("active");
  }
}
