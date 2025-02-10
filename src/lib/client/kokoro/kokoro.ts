import * as ort from "onnxruntime-web/webgpu";
import { getModel, getShapedVoiceFile } from "$lib/shared/resources";
import type { LangId, VoiceId } from "$lib/shared/resources";
import { tokenize } from "./tokenizer";
import { apiClient } from "$lib/client/apiClient";
import { detectWebGPU } from "$lib/client/utils";

ort.env.wasm.wasmPaths =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0-dev.20250206-d981b153d3/dist/";

const MODEL_CONTEXT_WINDOW = 512;

/**
 * generateVoice generates a voice from a given text.
 *
 * If the text is longer than the context window, it will be generated in chunks
 * and then concatenated.
 */
export async function generateVoice(params: {
  text: string;
  lang: LangId;
  voice: VoiceId;
  speed: number;
  webgpu: boolean;
}): Promise<Float32Array> {
  if (params.webgpu && !detectWebGPU()) {
    throw new Error("WebGPU is not supported in this browser");
  }

  const phonemes = await apiClient.phonemize(params.text, params.lang);
  const totalTokens = tokenize(phonemes);
  const totalTokensLen = totalTokens.length;

  const tokensPerChunk = MODEL_CONTEXT_WINDOW - 2; // -2 for the start and end gaps
  const chunksLen = Math.ceil(totalTokensLen / tokensPerChunk);
  const chunks: number[][] = [];
  for (let i = 0; i < chunksLen; i++) {
    const from = i * tokensPerChunk;
    const to = Math.min((i + 1) * tokensPerChunk, totalTokensLen);
    const chunkTokens = totalTokens.slice(from, to);
    chunks.push(chunkTokens);
  }

  const modelBuffer = await getModel("model_q8f16");
  const shapedVoice = await getShapedVoiceFile(params.voice);

  const sessionOpts = params.webgpu ? { executionProviders: ["webgpu"] } : {};
  const session = await ort.InferenceSession.create(modelBuffer, sessionOpts);

  const waveforms: Float32Array[] = [];
  let waveformsLen = 0;
  for await (const chunk of chunks) {
    const ref_s = shapedVoice[chunk.length - 1][0];
    const paddedTokens = [0, ...chunk, 0];

    const input_ids = new ort.Tensor("int64", paddedTokens, [
      1,
      paddedTokens.length,
    ]);
    const style = new ort.Tensor("float32", ref_s, [1, ref_s.length]);
    const speed = new ort.Tensor("float32", [params.speed], [1]);

    const result = await session.run({
      input_ids,
      style,
      speed,
    });

    const waveform = await result.waveform.getData();
    waveforms.push(waveform as Float32Array);
    waveformsLen += waveform.length;
  }

  const finalWaveform = new Float32Array(waveformsLen);
  let offset = 0;
  for (const waveform of waveforms) {
    finalWaveform.set(waveform, offset);
    offset += waveform.length;
  }

  return finalWaveform;
}

export async function generateChunk(params: {
  text: string;
  lang: "en-us" | "en-gb" | "es-la" | "es-es";
  voice: VoiceId;
  speed: number;
}): Promise<Float32Array> {
  const phonemes = await apiClient.phonemize(params.text, params.lang);
  const tokens = tokenize(phonemes);

  const modelBuffer = await getModel("model_q8f16");
  const session = await ort.InferenceSession.create(modelBuffer);

  const shapedVoice = await getShapedVoiceFile(params.voice);
  const ref_s = shapedVoice[tokens.length - 1][0];

  const paddedTokens = [0, ...tokens, 0];

  const input_ids = new ort.Tensor("int64", paddedTokens, [
    1,
    paddedTokens.length,
  ]);

  const style = new ort.Tensor("float32", ref_s, [1, ref_s.length]);

  const speed = new ort.Tensor("float32", [params.speed], [1]);
  const result = await session.run({
    input_ids,
    style,
    speed,
  });

  const waveform = await result["waveform"].getData();
  return waveform as Float32Array;
}
