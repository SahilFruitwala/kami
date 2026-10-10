/// <reference lib="webworker" />
import { KokoroTTS } from "kokoro-js";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

type In =
  | { type: "load" }
  | { type: "generate"; id: number; text: string; voice: string; speed: number };

let model: Promise<KokoroTTS> | null = null;

function load(): Promise<KokoroTTS> {
  model ??= (async () => {
    const progress_callback = (p: { status?: string; progress?: number }) => {
      if (p.status === "progress" && typeof p.progress === "number") {
        self.postMessage({ type: "progress", progress: p.progress });
      }
    };
    if ("gpu" in navigator) {
      try {
        return await KokoroTTS.from_pretrained(MODEL, { dtype: "fp32", device: "webgpu", progress_callback });
      } catch {
        // fall through to wasm
      }
    }
    return KokoroTTS.from_pretrained(MODEL, { dtype: "q8", device: "wasm", progress_callback });
  })();
  model.catch(() => {
    model = null;
  });
  return model;
}

self.onmessage = async (event: MessageEvent<In>) => {
  const msg = event.data;
  try {
    const tts = await load();
    if (msg.type === "load") {
      self.postMessage({ type: "ready" });
      return;
    }
    const audio = await tts.generate(msg.text, { voice: msg.voice as never, speed: msg.speed });
    const samples = audio.audio;
    self.postMessage({ type: "audio", id: msg.id, samples, rate: audio.sampling_rate }, [samples.buffer]);
  } catch (error) {
    self.postMessage({
      type: "error",
      id: msg.type === "generate" ? msg.id : -1,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
