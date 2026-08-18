import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWhisper } from './useWhisper.js';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function useSpeechToText() {
  const SR = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;
  const supported = Boolean(SR);
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState('');
  const [fallbackRecommended, setFallbackRecommended] = useState(false);

  const start = useCallback((onResult) => {
    if (!SR || recRef.current) return;
    setErr('');
    setFallbackRecommended(false);
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (event) => {
      const text = Array.from(event.results || [])
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim();
      if (text) onResult(text);
      else setErr('No speech detected — try speaking clearly and try again.');
    };
    rec.onerror = (event) => {
      const messages = {
        'not-allowed': 'Microphone access denied — allow mic permission for this site, then try again.',
        'service-not-allowed': 'The browser speech service is blocked. Try the offline mic fallback.',
        'audio-capture': 'No microphone found on this device.',
        'no-speech': 'No speech detected — try speaking clearly and try again.',
        'network': 'The browser speech service needs a network connection. Try the offline mic fallback.',
        'aborted': 'Listening was interrupted.',
      };
      setErr(messages[event.error] || `Speech error: ${event.error || 'unknown error'}`);
      setFallbackRecommended(['network', 'service-not-allowed', 'audio-capture'].includes(event.error));
      setListening(false);
      recRef.current = null;
    };
    rec.onnomatch = () => setErr('No speech detected — try again.');
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch (error) {
      console.error(error);
      recRef.current = null;
      setListening(false);
      setErr('Could not start the browser speech service. Try the offline mic fallback.');
      setFallbackRecommended(true);
    }
  }, [SR]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch (error) {
      console.error(error);
      recRef.current = null;
      setListening(false);
      setErr('Could not stop listening — try again.');
    }
  }, []);

  useEffect(() => () => {
    try {
      recRef.current?.abort();
    } catch (error) {
      console.error(error);
    }
    recRef.current = null;
  }, []);

  return { supported, listening, err, fallbackRecommended, start, stop };
}

function VoiceButton({ onText, label }) {
  const webSpeech = useSpeechToText();
  const whisper = useWhisper();
  const [useOffline, setUseOffline] = useState(!webSpeech.supported);

  useEffect(() => {
    if (!webSpeech.supported) setUseOffline(true);
  }, [webSpeech.supported]);

  if (webSpeech.supported && !useOffline) {
    const { listening, err, fallbackRecommended, start, stop } = webSpeech;
    return <span className="voiceWrap">
      <button
        type="button"
        className={`voiceBtn ${listening ? 'listening' : ''}`}
        title={label || 'Speak'}
        aria-label={label || 'Speak'}
        onClick={() => (listening ? stop() : start(onText))}
      >
        {listening ? '⏹' : '🎤'}
      </button>
      {listening && <small className="voiceHint">Listening…</small>}
      {err && <small className="voiceErr">{err}</small>}
      {fallbackRecommended && whisper.supported && (
        <button type="button" className="voiceFallback" onClick={() => setUseOffline(true)}>
          Use offline mic
        </button>
      )}
    </span>;
  }

  if (whisper.supported) {
    const { recording, status, err, start, stop } = whisper;
    const busy = status === 'loading-model' || status === 'transcribing';
    const hint = status === 'loading-model'
      ? 'Loading offline voice model (first use only)…'
      : status === 'transcribing'
        ? 'Transcribing…'
        : recording
          ? 'Recording… tap to stop'
          : '';
    return <span className="voiceWrap">
      <button
        type="button"
        className={`voiceBtn ${recording ? 'listening' : ''}`}
        title={label || 'Speak'}
        aria-label={label || 'Speak'}
        disabled={busy}
        onClick={() => (recording ? stop(onText) : start())}
      >
        {busy ? '…' : recording ? '⏹' : '🎤'}
      </button>
      {hint && <small className="voiceHint">{hint}</small>}
      {err && <small className="voiceErr">{err}</small>}
      {webSpeech.supported && !recording && !busy && (
        <button type="button" className="voiceFallback" onClick={() => setUseOffline(false)}>
          Use browser mic
        </button>
      )}
    </span>;
  }

  return <span className="voiceWrap">
    <button type="button" className="voiceBtn" disabled title="Voice input unavailable" aria-label="Voice input unavailable">🎤</button>
    <small className="voiceErr">
      {window.isSecureContext === false
        ? 'Mic requires HTTPS or localhost.'
        : 'Voice input unavailable — type instead.'}
    </small>
  </span>;
}

function App() {
  const [page, setPage] = useState('home');
  const [result, setResult] = useState(null);
  const [form, setForm] = useState({ symptoms: '', age: '', duration: '', severity: 5, conditions: '', medications: '', location: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const payload = {
        symptoms: form.symptoms.split(',').map((s) => s.trim()).filter(Boolean),
        age: form.age ? Number(form.age) : undefined,
        duration: form.duration,
        severity: Number(form.severity),
        existingConditions: form.conditions ? form.conditions.split(',').map((s) => s.trim()).filter(Boolean) : [],
        medications: form.medications ? form.medications.split(',').map((s) => s.trim()).filter(Boolean) : [],
        location: form.location,
      };
      const response = await fetch(`${API}/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to process request');
      setResult(data);
      setPage('result');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return <div className="app">
    <header><div className="brand"><span className="logo">+</span><div><strong>CareRoute</strong><small>AI Triage & Referral Router</small></div></div><nav><button onClick={() => setPage('home')}>Home</button><button onClick={() => setPage('about')}>How It Works</button><button className="navCta" onClick={() => setPage('triage')}>Start Triage</button></nav></header>
    <main>{page === 'home' && <Home onStart={() => setPage('triage')} />} {page === 'triage' && <Triage form={form} setForm={setForm} submit={submit} loading={loading} error={error} />} {page === 'result' && <Result result={result} onAgain={() => setPage('triage')} />} {page === 'about' && <About />}</main>
    <footer>This educational prototype provides preliminary guidance only. It does not replace professional medical advice, diagnosis, or treatment.</footer>
  </div>;
}

function Home({ onStart }) { return <section className="hero"><div className="heroText"><span className="eyebrow">HEALTH ACCESS • STUDENT PROTOTYPE</span><h1>Know your next step.<br /><em>Find the right care.</em></h1><p>Enter your symptoms and basic information to receive an initial urgency assessment and suggested referral options.</p><button className="primary" onClick={onStart}>Start a triage assessment →</button><div className="notice">⚕️ For emergencies or severe symptoms, seek immediate professional medical care.</div></div><div className="heroCard"><div className="pulse">+</div><h3>Simple. Explainable. Safety-first.</h3><p>Our prototype uses transparent rules to suggest urgency and medical specialty without claiming a diagnosis.</p><div className="levels"><span>LOW</span><span>MEDIUM</span><span>HIGH</span><span>EMERGENCY</span></div></div></section>; }

function Triage({ form, setForm, submit, loading, error }) {
  const update = (key, value) => setForm({ ...form, [key]: value });
  return <section className="panel"><div className="sectionHead"><span className="eyebrow">STEP 1</span><h2>Tell us what you're experiencing</h2><p>This information is used only for this prototype assessment.</p></div>{error && <div className="error">{error}</div>}<form onSubmit={submit}><label>Symptoms <span>comma-separated</span><span className="fieldRow"><textarea required value={form.symptoms} onChange={(e) => update('symptoms', e.target.value)} placeholder="e.g. headache, fever, sore throat (or tap the mic to speak)" /><VoiceButton label="Speak your symptoms" onText={(text) => update('symptoms', form.symptoms ? `${form.symptoms}, ${text}` : text)} /></span></label><div className="grid"><label>Age<input type="number" min="0" max="120" value={form.age} onChange={(e) => update('age', e.target.value)} placeholder="Optional" /></label><label>Duration<select value={form.duration} onChange={(e) => update('duration', e.target.value)}><option value="">Select</option><option>Less than 1 day</option><option>1–3 days</option><option>4–7 days</option><option>more than 1 week</option></select></label></div><label>Severity: <b>{form.severity}/10</b><input type="range" min="1" max="10" value={form.severity} onChange={(e) => update('severity', e.target.value)} /></label><label>Existing conditions <span>optional</span><span className="fieldRow"><input value={form.conditions} onChange={(e) => update('conditions', e.target.value)} placeholder="e.g. asthma, diabetes" /><VoiceButton label="Speak existing conditions" onText={(text) => update('conditions', form.conditions ? `${form.conditions}, ${text}` : text)} /></span></label><label>Medications <span>optional</span><span className="fieldRow"><input value={form.medications} onChange={(e) => update('medications', e.target.value)} placeholder="e.g. current medicines" /><VoiceButton label="Speak medications" onText={(text) => update('medications', form.medications ? `${form.medications}, ${text}` : text)} /></span></label><label>Location <span>optional</span><input value={form.location} onChange={(e) => update('location', e.target.value)} placeholder="City / town" /></label><div className="formActions"><button type="button" onClick={() => window.history.back()} className="secondary">Back</button><button className="primary" disabled={loading}>{loading ? 'Assessing…' : 'Get triage result →'}</button></div></form></section>;
}

function Result({ result, onAgain }) { if (!result) return null; return <section className="panel resultPanel"><span className="eyebrow">TRIAGE RESULT</span><div className={`urgency ${result.urgency.toLowerCase()}`}><small>URGENCY</small><strong>{result.urgency}</strong></div><div className="resultGrid"><div><span className="label">Suggested specialty</span><h2>{result.specialty}</h2></div><div><span className="label">Recommended next step</span><h3>{result.recommendedAction}</h3></div></div><div className="reason"><span className="label">Why</span><p>{result.reason}</p></div><h3>Referral options</h3><div className="referrals">{result.referrals?.length ? result.referrals.map((referral) => <article key={referral.id}><strong>{referral.name}</strong><span>{referral.city} · {referral.facility_type}</span><span>{referral.specialties}</span><small>{referral.address} · {referral.contact}</small></article>) : <p>No matching mock facility was found. Consider a local qualified healthcare provider.</p>}</div><div className="safety">⚕️ {result.safetyDisclaimer}</div><button className="primary" onClick={onAgain}>Start another assessment</button></section>; }

function About() { return <section className="about"><span className="eyebrow">ABOUT THE PROJECT</span><h2>How CareRoute works</h2><div className="steps"><div><b>01</b><h3>Collect</h3><p>The frontend collects symptoms and basic context.</p></div><div><b>02</b><h3>Validate</h3><p>The backend validates the request before processing.</p></div><div><b>03</b><h3>Triage</h3><p>An explainable rule engine estimates urgency and specialty.</p></div><div><b>04</b><h3>Route</h3><p>Mock facility data is filtered to provide referral options.</p></div></div><div className="safety"><strong>Medical safety</strong><br />This is an educational prototype. It does not diagnose conditions or replace a qualified medical professional. For emergencies, seek immediate professional care.</div></section>; }

export default App;
