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
  "lime",
  "deepskyblue",
  "deepskyblue",
  "deepskyblue",
  "crimson"
];

// Visual speed in pixels per second.
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
let allNotes = [];
let nextNoteIndex = 0;
let activeKeys = new Map();
let keyElements = new Map();
let keyPositions = new Map();
let noteAreaHeight = 0;
let songEnd = 0;

const progress = document.getElementById("progress");
const progressTime = document.getElementById("progress-time");

let songDuration = 0;

// --------------------------------------------------
// PIANO GENERATION
// --------------------------------------------------

function createPiano() {
  piano.replaceChildren();
  keyElements.clear();

  for (let octaveNumber = 1; octaveNumber <= 7; octaveNumber++) {
    const octave = document.createElement("div");
    octave.classList.add("octave");
    octave.dataset.octave = octaveNumber;

    // Create the 7 white keys first.
    for (let i = 0; i < noteNames.length; i++) {
      const name = noteNames[i];

      if (blackNotes.has(name)) continue;

      const midiNumber = (octaveNumber + 1) * 12 + i;
      const key = document.createElement("div");

      key.classList.add("key", "white");
      key.dataset.note = name;
      key.dataset.octave = octaveNumber;
      key.dataset.midi = midiNumber;

      octave.appendChild(key);
      keyElements.set(midiNumber, key);
    }

    // Position black keys over the gaps between white keys.
    const blackKeyPositions = {
      "C#": 1,
      "D#": 2,
      "F#": 4,
      "G#": 5,
      "A#": 6
    };

    for (const [name, whiteKeyIndex] of Object.entries(blackKeyPositions)) {
      const noteIndex = noteNames.indexOf(name);
      const midiNumber = (octaveNumber + 1) * 12 + noteIndex;
      const key = document.createElement("div");

      key.classList.add("key", "black");
      key.dataset.note = name;
      key.dataset.octave = octaveNumber;
      key.dataset.midi = midiNumber;

      key.style.left = `${(whiteKeyIndex / 7) * 100}%`;

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
    songDuration = Math.max(
      ...midi.tracks.flatMap(track =>
        track.notes.map(note => note.time + note.duration)
      )
    );

    progress.value = 0;
    progress.max = songDuration || 1;
    progress.style.setProperty("--progress", "0%");
    progressTime.textContent = `0:00 / ${formatTime(songDuration)}`;

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
    if (document.getElementById("pmode").checked) {
      document.getElementById("ui").style.display = "none";
      document.body.style.cursor = "none";
    }

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
  allNotes = [];
  nextNoteIndex = 0;
  keyPositions.clear();

  // Read layout once per playback, not once for every MIDI note.
  noteAreaHeight = Math.max(
    0,
    noteArea.clientHeight || window.innerHeight - PIANO_HEIGHT
  );

  const noteAreaRect = noteArea.getBoundingClientRect();

  for (const [midiNumber, key] of keyElements) {
    const rect = key.getBoundingClientRect();

    keyPositions.set(midiNumber, {
      left: rect.left - noteAreaRect.left,
      width: rect.width
    });
  }

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

  songEnd = 0;

  // Schedule audio separately from the visual animation.
  // MIDI note times and durations are already in seconds.
  for (const note of allNotes) {
    const startTime = startAt + note.time;
    const endTime = startTime + Math.max(0.01, note.duration);
    const frequency = Tone.Frequency(note.midi, "midi");

    synth.triggerAttack(frequency, startTime);
    synth.triggerRelease(frequency, endTime);

    scheduledNotes.push({ ...note, startTime, endTime });
    songEnd = Math.max(songEnd, note.time + Math.max(0.01, note.duration));
  }

  update();
}

// --------------------------------------------------
// FALLING NOTE VISUALS
// --------------------------------------------------

// Create a note only when it is close enough to enter the visible area.
function createNote(note) {
  const position = keyPositions.get(note.midi);

  // Don't render notes outside the generated piano range.
  if (!position) return;

  const element = document.createElement("div");
  element.classList.add("note");

  const height = Math.max(
    6,
    note.duration * PIXELS_PER_SECOND
  ) - 2;

  const top =
    noteAreaHeight -
    (note.time * PIXELS_PER_SECOND) -
    height;
  element.style.setProperty("--note-color", note.color);
  element.style.left = `${position.left}px`;
  element.style.width = `${position.width}px`;
  element.style.top = `${top}px`;
  element.style.height = `${height}px`;
  element.style.backgroundColor = note.color;

  noteArea.appendChild(element);

  visualNotes.push({
    element,
    midi: note.midi,
    time: note.time,
    duration: note.duration,
    endTime: note.time + note.duration,
    baseTop: top,
    active: false
  });
}

// --------------------------------------------------
// ANIMATION AND KEY HIGHLIGHTS
// --------------------------------------------------

function update() {
  if (!isPlaying || !Tone) return;

  const elapsed = Math.max(
    0,
    Tone.getContext().currentTime - playbackStart
  );

  progress.value = Math.min(elapsed, songDuration);
  progress.style.setProperty(
    "--progress",
    `${(progress.value / (songDuration || 1)) * 100}%`
  );
  progressTime.textContent =
    `${formatTime(elapsed)} / ${formatTime(songDuration)}`;

  // Add notes only when they are about to enter the visible note area.
  const earliestVisibleNoteTime =
    elapsed - noteAreaHeight / PIXELS_PER_SECOND;

  while (
    nextNoteIndex < allNotes.length &&
    allNotes[nextNoteIndex].time <=
      earliestVisibleNoteTime + noteAreaHeight / PIXELS_PER_SECOND * 2
  ) {
    const note = allNotes[nextNoteIndex];
    nextNoteIndex++;

    // Ignore notes that have already ended (for example after a delayed frame).
    if (elapsed >= note.time + note.duration) continue;

    createNote(note);
  }

  for (const note of visualNotes) {
    // Moving notes with transform avoids repeatedly changing layout positions.
    note.element.style.transform =
      `translateY(${elapsed * PIXELS_PER_SECOND - 2}px)`;

    const shouldBeActive =
      elapsed >= note.time && elapsed < note.endTime;

    if (shouldBeActive !== note.active) {
      note.active = shouldBeActive;
      changeKeyActivity(note.midi, shouldBeActive);
    }
  }

  // Remove ended notes without rebuilding the whole array each frame.
  let writeIndex = 0;

  for (let i = 0; i < visualNotes.length; i++) {
    const note = visualNotes[i];

    if (elapsed >= note.endTime) {
      if (note.active) {
        changeKeyActivity(note.midi, false);
      }

      note.element.remove();
    } else {
      visualNotes[writeIndex] = note;
      writeIndex++;
    }
  }

  visualNotes.length = writeIndex;

  ticksDisplay.textContent = `${elapsed.toFixed(2)}s`;

  if (elapsed >= songEnd && visualNotes.length === 0) {
    stopPlayback();
    ticksDisplay.textContent = "Finished";
    return;
  }

  animationFrame = requestAnimationFrame(update);
}

function formatTime(seconds) {
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
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

  if (synth && Tone) {
    synth.releaseAll();
  }

  for (const note of visualNotes) {
    note.element.remove();
  }

  visualNotes = [];
  scheduledNotes = [];
  allNotes = [];
  nextNoteIndex = 0;
  activeKeys.clear();
  keyPositions.clear();

  for (const key of keyElements.values()) {
    key.classList.remove("active");
  }
}
