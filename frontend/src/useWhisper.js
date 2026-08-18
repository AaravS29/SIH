import { useCallback, useRef, useState } from 'react';

// Offline in-browser speech-to-text fallback. The microphone is captured as
// raw PCM instead of a WebM/MP4 container, which avoids browser-specific
// decodeAudioData failures before Whisper runs.
const MODEL_ID = 'Xenova/whisper-tiny.en';
let transcriberPromise = null;

function isSecureMicContext() {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function getAudioContextClass() {
  return typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
}

function microphoneError(error) {
  const code = error?.name || error?.message || '';
  if (code === 'NotAllowedError' || code === 'PermissionDeniedError') {
    return 'Microphone access denied — allow mic permission for this site, then try again.';
  }
  if (code === 'NotFoundError' || code === 'DevicesNotFoundError') {
    return 'No microphone found on this device.';
  }
  if (code === 'NotReadableError' || code === 'TrackStartError') {
    return 'The microphone is busy in another app or tab.';
  }
  if (!isSecureMicContext()) {
    return 'Microphone input requires HTTPS or localhost. Open the app using a secure URL.';
  }
  return 'Could not start the microphone — check browser permissions and try again.';
}

async function assertLocalModelAssets() {
  if (typeof window === 'undefined') return;
  const configUrl = new URL('/models/Xenova/whisper-tiny.en/config.json', window.location.origin);
  const response = await fetch(configUrl, { cache: 'no-store' });
  const body = await response.text();
  if (!response.ok || !body.trim().startsWith('{')) {
    throw new Error(`Local Whisper model is missing at ${configUrl.pathname}. Extract the latest project archive and run Vite from its frontend folder.`);
  }
  try {
    JSON.parse(body);
  } catch {
    throw new Error(`Local Whisper model config is not valid JSON at ${configUrl.pathname}.`);
  }
}

async function createTranscriber(remote = false) {
  const { env, pipeline } = await import('@xenova/transformers');
  env.allowRemoteModels = remote;
  env.allowLocalModels = !remote;
  env.localModelPath = typeof window !== 'undefined'
    ? new URL('/models/', window.location.origin).href
    : '/models/';
  // Firefox can fail when ONNX Runtime tries to use multiple WASM threads
  // without cross-origin isolation. Keep the local model on the portable
  // single-threaded WASM path.
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
    // Vite/Vercel serves these files from frontend/public/onnx.
    env.backends.onnx.wasm.wasmPaths = typeof window !== 'undefined'
      ? new URL('/onnx/', window.location.origin).href
      : '/onnx/';
  }
  return pipeline('automatic-speech-recognition', MODEL_ID);
}

async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      try {
        // Prefer the bundled local model so audio stays fully local.
        await assertLocalModelAssets();
        return await createTranscriber(false);
      } catch (localError) {
        // If the model was omitted during a GitHub upload or a stale build is
        // running, use the public model as a compatibility fallback. Audio is
        // still passed only to the in-browser pipeline, not to the backend.
        console.warn('Local Whisper assets unavailable; trying the public model.', localError);
        return createTranscriber(true);
      }
    })().catch((error) => {
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise;
}

function resampleTo16k(samples, inputRate) {
  if (inputRate === 16000) return samples;
  const outputLength = Math.max(1, Math.round(samples.length * 16000 / inputRate));
  const output = new Float32Array(outputLength);
  const ratio = inputRate / 16000;
  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const weight = position - left;
    output[i] = (samples[left] || 0) * (1 - weight) + (samples[right] || 0) * weight;
  }
  return output;
}

function mergeAudioChunks(chunks) {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function safeDisconnect(node) {
  try {
    node?.disconnect();
  } catch (error) {
    // Firefox may report an already-disconnected Web Audio node; cleanup can continue.
    console.debug('Audio node already disconnected', error);
  }
}

async function stopCapture(capture) {
  if (!capture) return new Float32Array();
  capture.processor.onaudioprocess = null;
  safeDisconnect(capture.source);
  safeDisconnect(capture.processor);
  safeDisconnect(capture.silentGain);
  capture.stream.getTracks().forEach((track) => track.stop());
  const samples = mergeAudioChunks(capture.chunks);
  const sampleRate = capture.audioContext.sampleRate;
  try {
    await capture.audioContext.close?.();
  } catch (error) {
    console.debug('Audio context was already closed', error);
  }
  return resampleTo16k(samples, sampleRate);
}

export function useWhisper() {
  const AudioCtx = getAudioContextClass();
  const secure = isSecureMicContext();
  const supported = secure && typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!AudioCtx &&
    typeof AudioCtx.prototype.createScriptProcessor === 'function';

  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('idle');
  const [err, setErr] = useState('');
  const captureRef = useRef(null);
  const pendingTextCallback = useRef(null);

  const start = useCallback(async () => {
    if (!supported || captureRef.current) return;
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: { ideal: 1 }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const audioContext = new AudioCtx();
      await audioContext.resume?.();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      const capture = { stream, audioContext, source, processor, silentGain, chunks: [] };
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        capture.chunks.push(new Float32Array(input));
      };
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);
      captureRef.current = capture;
      setRecording(true);
      setStatus('recording');
    } catch (error) {
      captureRef.current?.stream?.getTracks().forEach((track) => track.stop());
      captureRef.current = null;
      setRecording(false);
      setStatus('idle');
      setErr(microphoneError(error));
    }
  }, [AudioCtx, supported]);

  const stop = useCallback(async (onText) => {
    const capture = captureRef.current;
    if (!capture) return;
    pendingTextCallback.current = onText || null;
    captureRef.current = null;
    setRecording(false);
    try {
      setStatus('loading-model');
      const audioData = await stopCapture(capture);
      if (audioData.length < 1600) throw new Error('The microphone returned too little audio.');
      const transcriber = await getTranscriber();
      setStatus('transcribing');
      const result = await transcriber(audioData, { chunk_length_s: 30, stride_length_s: 5 });
      const text = (result?.text || '').trim();
      setStatus('idle');
      if (text && pendingTextCallback.current) pendingTextCallback.current(text);
      else if (!text) setErr('No speech detected — try speaking clearly and try again.');
    } catch (error) {
      console.error(error);
      setStatus('idle');
      setErr(error?.message?.includes('too little')
        ? 'No audio was recorded — hold the mic for a moment, then try again.'
        : 'Transcription failed — please retry. The local model was unavailable and the public fallback could not load.' );
    } finally {
      pendingTextCallback.current = null;
    }
  }, []);

  return { supported, recording, status, err, start, stop };
}
