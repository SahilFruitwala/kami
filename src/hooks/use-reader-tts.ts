import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { listVoices, speakArticle, ttsAvailable, type TtsStatus, type TtsWord } from "@/lib/tts.ts";
import { clearSpokenWord, collectSpokenText, paintSpokenWord } from "@/lib/spoken-range.ts";
import { useLibraryStore } from "@/lib/store.ts";

const RATES = [
  { value: 0.75, label: "0.75×" },
  { value: 1, label: "1×" },
  { value: 1.25, label: "1.25×" },
  { value: 1.5, label: "1.5×" },
] as const;

export { RATES };

export function useReaderTts(canonicalUrl: string, bodyRef: React.RefObject<HTMLDivElement | null>) {
  const ttsRef = useRef<{
    stop: () => void;
    pause: () => void;
    resume: () => void;
    setOptions: (next: { rate?: number; voiceURI?: string }) => void;
  } | null>(null);
  const [tts, setTts] = useState<TtsStatus>("idle");
  const [word, setWord] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [listenOpen, setListenOpen] = useState(false);
  const canSpeak = ttsAvailable();

  const ttsRate = useLibraryStore((s) => s.ttsRate);
  const ttsVoiceURI = useLibraryStore((s) => s.ttsVoiceURI);
  const setTtsRate = useLibraryStore((s) => s.setTtsRate);
  const setTtsVoiceURI = useLibraryStore((s) => s.setTtsVoiceURI);

  useEffect(() => {
    const load = () => setVoices(listVoices(ttsVoiceURI));
    load();
    window.speechSynthesis?.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", load);
  }, [ttsVoiceURI]);

  useEffect(() => {
    ttsRef.current?.setOptions({ rate: ttsRate, voiceURI: ttsVoiceURI });
  }, [ttsRate, ttsVoiceURI]);

  useEffect(() => {
    return () => {
      ttsRef.current?.stop();
      ttsRef.current = null;
      clearSpokenWord();
    };
  }, [canonicalUrl]);

  function stopTts() {
    ttsRef.current?.stop();
    ttsRef.current = null;
    setTts("idle");
    setWord("");
    setListenOpen(false);
    clearSpokenWord();
  }

  function onSpokenWord(next: TtsWord) {
    setWord(next.word);
    paintSpokenWord(bodyRef.current, next.start, next.end);
  }

  function toggleListen() {
    if (!canSpeak) {
      toast.error("This browser cannot read aloud.");
      return;
    }
    if (tts === "playing") {
      ttsRef.current?.pause();
      return;
    }
    if (tts === "paused") {
      ttsRef.current?.resume();
      return;
    }
    try {
      const plain = collectSpokenText(bodyRef.current);
      if (!plain.trim()) {
        toast.error("Nothing to read in this article.");
        return;
      }
      setListenOpen(true);
      setWord("Listening");
      ttsRef.current = speakArticle(plain, {
        rate: ttsRate,
        voiceURI: ttsVoiceURI,
        onStatus: (status) => {
          setTts(status);
          if (status === "idle") setListenOpen(false);
        },
        onWord: onSpokenWord,
      });
    } catch {
      toast.error("Could not start reading aloud.");
    }
  }

  return {
    canSpeak,
    tts,
    word,
    voices,
    listenOpen,
    ttsRate,
    ttsVoiceURI,
    setTtsRate,
    setTtsVoiceURI,
    stopTts,
    toggleListen,
  };
}
