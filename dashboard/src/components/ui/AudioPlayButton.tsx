import { useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

// Real Gemini-TTS pronunciation audio -- lets someone hear a local phrase
// said correctly before landing in a city, not just read it phonetically.
export function AudioPlayButton({ src, accent }: { src: string; accent: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else el.play();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? "Pause pronunciation" : "Play pronunciation"}
      className="flex size-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/[0.06]"
      style={{ color: accent }}
    >
      {playing ? <Pause size={13} /> : <Play size={13} />}
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
    </button>
  );
}
