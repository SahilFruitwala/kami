/// <reference lib="webworker" />
import { KokoroTTS } from "kokoro-js";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

type In =
  | { type: "load" }
  | { type: "generate"; id: number; text: string; voice: string; speed: number };

let model: Promise<KokoroTTS> | null = null;
let useWebGpu = "gpu" in navigator;

function load(): Promise<KokoroTTS> {
  model ??= (async () => {
    const progress_callback = (p: { status?: string; progress?: number }) => {
      if (p.status === "progress" && typeof p.progress === "number") {
        self.postMessage({ type: "progress", progress: p.progress });
      }
    };
    if (useWebGpu) {
      try {
        return await KokoroTTS.from_pretrained(MODEL, { dtype: "fp32", device: "webgpu", progress_callback });
      } catch {
        useWebGpu = false;
      }
    }
    return KokoroTTS.from_pretrained(MODEL, { dtype: "q8", device: "wasm", progress_callback });
  })();
  model.catch(() => {
    model = null;
  });
  return model;
}

// WebGPU can load fine yet fail at inference time (common on mobile GPUs),
// so retry once on the wasm backend before reporting an error.
async function generate(text: string, voice: string, speed: number) {
  const attempt = load();
  const tts = await attempt;
  try {
    return await tts.generate(text, { voice: voice as never, speed });
  } catch (error) {
    // Concurrent requests may fail together; only the first resets the model.
    if (model === attempt) {
      if (!useWebGpu) throw error;
      useWebGpu = false;
      model = null;
    } else if (useWebGpu) {
      throw error;
    }
    const fallback = await load();
    return fallback.generate(text, { voice: voice as never, speed });
  }
}

self.onmessage = async (event: MessageEvent<In>) => {
  const msg = event.data;
  try {
    if (msg.type === "load") {
      await load();
      self.postMessage({ type: "ready" });
      return;
    }
    const audio = await generate(msg.text, msg.voice, msg.speed);
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
