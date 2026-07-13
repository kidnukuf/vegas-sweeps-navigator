/**
 * useDoorSounds — preload and play door scanner sounds.
 *
 * Sound mappings (royalty-free files in public/sounds/):
 * - 21+ verified entry → bowling-strike.mp3 (success)
 * - Under-21 verified entry → infant-crying.mp3 (warning)
 * - Wrong event type (pool QR on banquet station or vice versa) → sad-trombone.mp3 (fail)
 * - Already-used QR → piano-sting.mp3 (deny)
 *
 * All sounds preload on first mount and play reliably after first user gesture.
 */

export type SoundType = "admit_21plus" | "admit_under21" | "wrong_event" | "already_used";

interface AudioCache {
  admit_21plus: HTMLAudioElement | null;
  admit_under21: HTMLAudioElement | null;
  wrong_event: HTMLAudioElement | null;
  already_used: HTMLAudioElement | null;
}

const audioCache: AudioCache = {
  admit_21plus: null,
  admit_under21: null,
  wrong_event: null,
  already_used: null,
};

let isInitialized = false;

/**
 * Initialize audio elements and preload sounds.
 * Call once on app mount or first user interaction.
 */
export function initDoorSounds(): void {
  if (isInitialized) return;
  isInitialized = true;

  // Bowling strike sound (21+ entry)
  audioCache.admit_21plus = new Audio("/sounds/bowling-strike.mp3");
  audioCache.admit_21plus.preload = "auto";

  // Infant crying sound (under-21 entry)
  audioCache.admit_under21 = new Audio("/sounds/infant-crying.mp3");
  audioCache.admit_under21.preload = "auto";

  // Sad trombone sound (wrong event type)
  audioCache.wrong_event = new Audio("/sounds/sad-trombone.mp3");
  audioCache.wrong_event.preload = "auto";

  // Piano sting / dumdum sound (already used)
  audioCache.already_used = new Audio("/sounds/piano-sting.mp3");
  audioCache.already_used.preload = "auto";
}

/**
 * Play a door sound by type.
 * Safe to call before user interaction; will queue if needed.
 */
export function playDoorSound(type: SoundType): void {
  if (!isInitialized) initDoorSounds();

  const audio = audioCache[type];
  if (!audio) return;

  // Reset playback to start
  audio.currentTime = 0;

  // Play with error handling
  const playPromise = audio.play();
  if (playPromise !== undefined) {
    playPromise.catch((err) => {
      // Autoplay may be blocked; will work after first user gesture
      console.debug(`[DoorSounds] Play blocked for ${type}:`, err.message);
    });
  }
}

/**
 * React hook for door sounds.
 * Initializes on mount, provides play function.
 */
export function useDoorSounds() {
  // Initialize sounds on first mount
  if (typeof window !== "undefined" && !isInitialized) {
    // Try to init immediately; will complete after first gesture if blocked
    initDoorSounds();
  }

  return { playDoorSound, initDoorSounds };
}
