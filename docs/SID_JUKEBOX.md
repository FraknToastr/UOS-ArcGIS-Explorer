# C64 SID jukebox

The launcher now plays the requested original C64 SID programs through a bundled 6510/SID emulator. It does not transcribe the tunes into Web Audio notes, substitute an original composition, play commercial MP3 recordings, or render whole tracks into PCM buffers.

Open the small music-note control beside Play SID to choose a track, move to the previous/next tune, or change volume. The first playback starts following an explicit action; the main button mutes, and the icon-only restart control in the previous/next/volume row restarts the selected tune. The selector remains inside a compact native disclosure panel and fits the tested 390-pixel mobile viewport. Author/subtune information is visible inside that panel. The runtime credits link points to `assets/sid-credits.txt`, which is also included in generated offline exports.

## Verified tracks and subtunes

The actual downloaded PSID files are stored losslessly as base64 in `launcher/sid-tracks.js` so ordinary classic scripts can load them directly from disk without file-origin fetch permissions. There is one encoded payload per tune, not a duplicate recording. Decoding all three files occupies 51,233 bytes.

| Tune | PSID composer | Copyright field in supplied file | Chosen one-based subtune | File bytes |
| --- | --- | --- | ---: | ---: |
| Cybernoid II | Jeroen Tel | 1988 Hewson | 1 of 2 | 4,502 |
| ACE II | Rob Hubbard | 1987 Cascade Games | 1 of 1 | 3,454 |
| Last Ninja 2 · Central Park | Matt Gray | 1988 System 3 | **2 of 13** | 43,277 |

All three files identify PSID version 2 with a 124-byte data offset, PAL timing and a MOS6581 preference. Their source headers were inspected and are checked by the browser test. The emulator receives zero-based subtune indices, so the chosen values are converted to `0, 0, 1` at the playback boundary.

Last Ninja 2 subtune **2** is the Central Park in-game theme. Subtune **1** is the loader; it is not used as the requested theme. The distinction is corroborated by the [Last Ninja 2 SID/subtune information](https://www.slayradio.org/sidinfo/MUSICIANS/G/Gray_Matt/Last_Ninja_2.sid). The deterministic core regression also confirms that subtunes 1 and 2 produce different PCM.

Sources:

- [Cybernoid II PSID, HVSC](https://www.hvsc.c64.org/download/C64Music/MUSICIANS/T/Tel_Jeroen/Cybernoid_II.sid)
- [ACE II PSID, HVSC](https://www.hvsc.c64.org/download/C64Music/MUSICIANS/H/Hubbard_Rob/ACE_II.sid)
- [Last Ninja 2 PSID, HVSC](https://www.hvsc.c64.org/download/C64Music/MUSICIANS/G/Gray_Matt/Last_Ninja_2.sid)

Payload SHA-256 values, also checked against the decoded runtime bytes:

```text
Cybernoid_II.sid  41f338f44b4f54e351e672156ee0e2a60c8437eb24645db3f9d4abfbb0cff192
ACE_II.sid       7d975ebb28c86fc01823e44953344d55f10bfdcf2943533344d8f4d717b2c88c
Last_Ninja_2.sid 7686b46aada0a107dd9717b47e76209acca9e47b92a6ea10657fcbd63f24588a
```

## Emulator and adaptation

`vendor/sid-core.js` adapts **Hermit jsSID 0.9.1**, by Mihaly Horvath (Hermit), 2016, from [the upstream source](https://github.com/og2t/jsSID). The upstream `jsSID.js` Git blob is `552a05f94353160158a485852629b43107c41c96`. Its author describes the code's licence as the “WTF license”; the original README and licence statement are retained in `vendor/jsSID-README.txt`. No different or more restrictive tune licence is inferred from that emulator statement.

The CPU and SID emulation algorithms are retained. The adaptation removes the emulator's private AudioContext, XHR loader and direct graph connection; supplies the sample rate and actual PSID byte arrays; parses the header/load address correctly; applies the selected 6581 preference; isolates formerly implicit global state; resets CPU/SID/filter/oscillator state on restart; exposes bounded PCM rendering, and saves/restores complete fixed-size emulator checkpoints. Optional background noise is disabled, so nonzero test output comes from the tune programs rather than an added noise source.

AudioWorklet is the preferred output path. Its module is created locally from the bundled core and controller code using a temporary Blob URL, then revoked after loading. One processor streams mono 128-frame render blocks. Tune-change messages are coalesced before a render quantum; generation IDs prevent an old selection from starting after a newer one. Track changes and restarts reuse the same processor, gain and context.

When AudioWorklet is unsupported, blocked or fails its bounded initialisation check, one ScriptProcessor streams 2,048-frame blocks through the same core. This fallback works directly from disk and does not depend on a CDN, server, flags or additional packages. ScriptProcessor is a deprecated browser API; it remains a compatibility fallback, not a claim of universal future support. In this Chromium environment, `file://` rejected Blob worklet modules with an `AbortError`; that capability failure correctly selects the fallback rather than being mistaken for user cancellation. Localhost successfully executed AudioWorklet.

Only one audio context, one source and one master gain are created per active page session. PCM is produced into the browser's current render block; no full-track audio buffers or oscillator scheduling queues are accumulated. Each core has a 64 KiB C64 memory image plus its fixed waveform/filter state. The decoded tune cache is bounded to the three supplied PSID files. These bounds are not a total browser-memory guarantee.

Mute silences the gain and suspends the context. Hidden tabs pause and suspend while retaining the user's playback intent; visibility restoration resumes an already authorised session. Leaving the page disconnects the source/gain, closes ports/context and releases the decoded cache. Departure records the selected track, volume, playback intent and complete CPU/SID/filter/memory state in tab-scoped sessionStorage. Returning through the application return link or browser history restores the exact next emulator sample. Automatic resume follows the previous playback intent; where browser autoplay policy suspends the context, Resume SID continues from the saved point. A muted session remains muted. A checkpoint is tied to the tune hash and sample rate and validated before restoration. Async context/module/load operations use epochs and context identity so stale completion cannot revive an old tune or disposed page.

## Rights and credits

The SID payloads remain copyrighted by their respective rights holders. PSID credit fields describe the supplied files and do not establish current ownership or grant a licence. The files are included for the requested private evaluation. They are **not** presented as open-licensed, Creative Commons, or covered by the emulator's permissive code licence.

HVSC states that uses beyond private enjoyment require the relevant rights under applicable copyright law; it does not grant commercial or general redistribution licences on behalf of composers. Any public/commercial deployment of the bundled tunes needs the relevant rightsholder permissions. See the [HVSC copyright notice](https://www.hvsc.c64.org/info). The same distinction and source credits are retained in the runtime `assets/sid-credits.txt`.

## Executed validation

`tests/test_sid_core.cjs` executes each bundled PSID at 48 kHz for 48,000 frames. It verifies the source hashes, finite/nonzero PCM, distinct output for all three tunes, deterministic restart, and the difference between Last Ninja 2's loader and Central Park in-game subtunes. First-second RMS values were approximately 0.1149 (Cybernoid II), 0.1269 (ACE II) and 0.0384 (Central Park). Raw source and PCM fingerprints are recorded in `tests/results/sid-core.json`.

`tests/test_audio.cjs` uses a real Chromium AudioContext and measures actual AudioNode graph samples with an AnalyserNode. It passed in three separately created page contexts:

1. Direct file: automatic ScriptProcessor fallback, 2,048-frame blocks.
2. Localhost HTTP: actual AudioWorklet, 128-frame blocks.
3. Direct file with ScriptProcessor deliberately forced: 2,048-frame blocks.

Each path plays all three selected subtunes and checks real nonzero graph samples, verified composers/file hashes, restart, mute, six start/mute cycles, previous/next selection, selecting while muted, rapid selection races, actual silence at volume zero, hidden-tab suspension/resume, one context/source, mobile popup bounds and context closure on page exit. No uncaught page errors occurred. Raw browser results are in `tests/results/audio.json`.

These checks establish that the actual tune programs execute and produce audio through the real browser graph. They are not a human listening assessment, a bit-exact comparison with physical SID hardware, or tests on a managed Edge/mobile audio device. Hermit jsSID is a lightweight sample-period emulator, not a complete cycle-accurate C64; its upstream limitations include specialised digital samples and unusual interrupt-dependent players. The selected tunes were executed; arbitrary SID compatibility is not promised.

Developer repeat commands, from the suite folder:

```text
rtk node -e 'require("./tests/test_sid_core.cjs")'
rtk node -e 'require("./tests/test_audio.cjs")'
```

The browser test accepts `UOS_AUDIO_ROOT`, `REVIEW_PLAYWRIGHT`, `GDB_CHROMIUM_PATH` and optional `UOS_AUDIO_RESULTS` to target an exact clean packaged extraction and an available developer browser. Playback itself requires none of these tools.

`tests/test_audio_return.cjs` validates actual GDB/history and Online/return-link round trips, both ScriptProcessor and AudioWorklet restoration, and the icon-only restart control. `tests/test_sid_core.cjs` additionally compares the exact next 4,096 samples after restoring each tune checkpoint.
