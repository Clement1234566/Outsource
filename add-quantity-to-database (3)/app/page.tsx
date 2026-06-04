'use client';

import { useState, useRef, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

interface RedeemResult {
  nik: string;
  nama: string;
  departemen: string;
  prize_name: string;
  redeemed_at: string;
}

const REVEAL_DELAY_MS = 1300;
const SURPRISE_CLOSE_DELAY_MS = 260;

export default function Page() {
  const { toast } = useToast();
  const [nik, setNik] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showReveal, setShowReveal] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [showSurprise, setShowSurprise] = useState(false);
  const nikInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Audio context initialization
  useEffect(() => {
    const handleUserInteraction = async () => {
      if (!audioContextRef.current) {
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioContextRef.current = new AudioContextClass();
          if (audioContextRef.current.state === 'suspended') {
            try {
              await audioContextRef.current.resume();
            } catch (e) {
              console.log('[v0] Audio context resume failed:', e);
            }
          }
        }
      }
    };

    window.addEventListener('click', handleUserInteraction);
    return () => window.removeEventListener('click', handleUserInteraction);
  }, []);

  const normalizeNik = (rawNik: string) => {
    return rawNik.replace(/\D/g, '');
  };

  const playRevealSound = () => {
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime + 0.01;
    const notes = [330, 392, 494, 659];
    const SOUND_GAIN_MULTIPLIER = 1.9;

    notes.forEach((note, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const outputGain = Math.min(0.06 * SOUND_GAIN_MULTIPLIER, 0.22);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(note, now + index * 0.1);
      gain.gain.setValueAtTime(0.0001, now + index * 0.1);
      gain.gain.exponentialRampToValueAtTime(outputGain, now + index * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.1 + 0.17);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + index * 0.1);
      osc.stop(now + index * 0.1 + 0.2);
    });
  };

  const playSurpriseSound = () => {
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime + 0.02;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1174.66, 1318.51];
    const SOUND_GAIN_MULTIPLIER = 1.9;

    notes.forEach((note, index) => {
      const noteTime = now + index * 0.075;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const outputGain = Math.min(0.07 * SOUND_GAIN_MULTIPLIER, 0.22);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note, noteTime);
      gain.gain.setValueAtTime(0.0001, noteTime);
      gain.gain.exponentialRampToValueAtTime(outputGain, noteTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.24);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(noteTime);
      osc.stop(noteTime + 0.27);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const trimmedNik = nik.trim().replace(/[–—]/g, '-');
    console.log('NIK dikirim:', JSON.stringify(trimmedNik));
    console.log('NIK hex:', [...trimmedNik].map(c => c.charCodeAt(0).toString(16)).join(' '));

    if (!trimmedNik) {
      setErrorMessage('NIK tidak boleh kosong.');
      return;
    }

    setIsSubmitting(true);

    try {
      // First validate - send original input, not normalized
      const validateRes = await fetch('/api/employee/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nik: trimmedNik }),
      });

      const validateData = await validateRes.json();

      if (!validateData.success) {
        setErrorMessage(validateData.message);
        setIsSubmitting(false);
        return;
      }

      // Show reveal animation
      setShowReveal(true);
      playRevealSound();

      // Wait for reveal animation
      await new Promise((resolve) => setTimeout(resolve, REVEAL_DELAY_MS));

      // Call redeem API - use employee NIK from validation response
      const redeemRes = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nik: validateData.data.nik }),
      });

      const redeemData = await redeemRes.json();

      if (!redeemData.success) {
        setErrorMessage(redeemData.message);
        setShowReveal(false);
        setIsSubmitting(false);
        return;
      }

      setShowReveal(false);
      setResult(redeemData.data);
      setShowSurprise(true);
      playSurpriseSound();

      toast({
        title: 'Berhasil!',
        description: `${redeemData.data.nama} mendapatkan ${redeemData.data.prize_name}`,
      });
    } catch (error) {
      console.error('[v0] Submit error:', error);
      setErrorMessage('Terjadi kesalahan, silakan coba lagi.');
    } finally {
      setShowReveal(false);
      setIsSubmitting(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch('/api/redeem-history');
      const data = await res.json();

      if (!data.success || data.data.length === 0) {
        setErrorMessage('Belum ada data history untuk diekspor.');
        return;
      }

      // Create CSV content
      const headers = ['NIK', 'Nama Karyawan', 'Departemen', 'Merchandise', 'Waktu Redeem'];
      const rows = data.data.map((entry: any) => [
        entry.nik,
        entry.employee_name,
        entry.departemen,
        entry.prize_name,
        new Date(entry.redeemed_at).toLocaleString('id-ID'),
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row: string[]) => row.map((cell) => `"${cell}"`).join(',')),
      ].join('\n');

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `history-merchandise-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Sukses',
        description: 'History berhasil diunduh',
      });
    } catch (error) {
      console.error('[v0] Export error:', error);
      setErrorMessage('Gagal mengekspor history.');
    }
  };

  return (
    <main className="shell">
      <section className="card">
        <p className="badge">Pembagian Merchandise</p>
        <h1>Input NIK Pekerja</h1>
        <p className="subtitle">
          Masukkan Nomor Induk Karyawan, lalu klik submit untuk melihat merchandise yang didapat.
        </p>

        <form onSubmit={handleSubmit} className="form" autoComplete="off">
          <label htmlFor="nikInput" className="input-label">
            Nomor Induk Karyawan
          </label>
          <div className="input-row">
            <input
              ref={nikInputRef}
              id="nikInput"
              type="text"
              inputMode="text"
              maxLength={20}
              value={nik}
              onChange={(e) => setNik(e.target.value)}
              placeholder="Contoh: 22019001 atau PJU-IKT 001082024004 "
              required
            />
            <button type="submit" id="submitBtn" disabled={isSubmitting}>
              {isSubmitting ? 'Mengundi...' : 'Submit'}
            </button>
          </div>
          {errorMessage && (
            <p className="error-message" role="alert">
              {errorMessage}
            </p>
          )}
        </form>

        {showReveal && (
          <section className="reveal" role="status" aria-live="polite">
            <div className="reveal-spinner" aria-hidden="true"></div>
            <p className="reveal-text">NIK {nik} sedang diundi...</p>
          </section>
        )}

        {result && !showSurprise && (
          <section className="result result-reveal" role="status" aria-live="polite">
            <p className="result-label">
              Merchandise untuk NIK <span id="resultNik">{result.nik}</span>
            </p>
            <h2>{result.prize_name}</h2>
            <p className="result-meta">
              Waktu: {new Date(result.redeemed_at).toLocaleString('id-ID')}
            </p>
          </section>
        )}

        <div className="actions">
          <button type="button" onClick={handleExport} className="ghost-btn">
            Export History ke CSV
          </button>
        </div>
      </section>

      {showSurprise && result && (
        <section className="surprise-overlay is-visible" role="dialog" aria-modal="true">
          <div className="surprise-box">
            <div className="surprise-confetti" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            <p className="surprise-tag">Surprise</p>
            <h2 id="surpriseTitle">Selamat!</h2>
            <p className="surprise-desc">Kamu mendapatkan merchandise:</p>
            <div className="surprise-visual">
              <span className="surprise-icon" aria-hidden="true">
                🎁
              </span>
            </div>
            <p className="surprise-merchandise">{result.prize_name}
            </p>
            <p className="surprise-name"> {result.nama}
            </p>
            <p className="surprise-nik">
                  NIK: <span>{result.nik}</span>
                    </p>
            <button
              type="button"
              className="close-surprise-btn"
              onClick={() => {
                setShowSurprise(false);
                setNik('');
                setResult(null);
                nikInputRef.current?.focus();
              }}
            >
              Tutup
            </button>
          </div>
        </section>
      )}

      <style jsx>{`
        :root {
          --bg: #fffaf2;
          --surface: rgba(255, 250, 242, 0.94);
          --surface-border: rgba(107, 31, 42, 0.24);
          --text: #3f1d1d;
          --text-soft: #6b1f2a;
          --primary: #7f1d1d;
          --primary-strong: #651414;
          --accent: #a63b47;
          --danger: #f43f5e;
          --ok: #22c55e;
        }

        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }

        :global(html),
        :global(body) {
          margin: 0;
          height: 100%;
          font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
          color: var(--text);
          background: radial-gradient(circle at 14% 18%, rgba(166, 59, 71, 0.2), transparent 42%),
            radial-gradient(circle at 82% 10%, rgba(127, 29, 29, 0.13), transparent 40%),
            linear-gradient(160deg, #fffaf2 0%, #f8ead8 48%, #fff5e8 100%);
        }

        :global(body) {
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .shell {
          width: min(680px, 100%);
        }

        .card {
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, rgba(255, 252, 246, 0.9), rgba(247, 232, 216, 0.83)),
            url('https://hebbkx1anhila5yf.public.blob.vercel-storage.com/card-background-CcOvGX39n74239YfphrrKAPJHoXonk.png')
              center/cover no-repeat;
          border: 1px solid var(--surface-border);
          border-radius: 24px;
          padding: 30px;
          box-shadow: 0 16px 30px rgba(107, 31, 42, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.7);
        }

        .card::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(
            165deg,
            rgba(127, 29, 29, 0.12),
            rgba(255, 255, 255, 0.14) 45%,
            rgba(107, 31, 42, 0.1)
          );
        }

        .card > * {
          position: relative;
          z-index: 1;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin: 0;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(127, 29, 29, 0.12);
          color: #6b1f2a;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        h1 {
          margin: 14px 0 8px;
          font-size: clamp(28px, 4vw, 38px);
          line-height: 1.1;
        }

        .subtitle {
          margin: 0 0 24px;
          color: #6b1f2a;
          font-size: 15px;
          line-height: 1.6;
        }

        .form {
          margin-top: 20px;
          display: grid;
          gap: 10px;
        }

        .input-label {
          font-size: 13px;
          color: #6b1f2a;
          font-weight: 600;
        }

        .input-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .input-label {
          font-size: 13px;
          color: #6b1f2a;
          font-weight: 600;
        }

        .input-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        input[type='text'] {
          flex: 1 1 270px;
          height: 50px;
          border-radius: 14px;
          border: 1px solid rgba(107, 31, 42, 0.3);
          background: rgba(255, 250, 245, 0.96);
          color: var(--text);
          padding: 0 16px;
          font-size: 15px;
          font-weight: 500;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        input[type='text']:focus {
          border-color: rgba(127, 29, 29, 0.82);
          box-shadow: 0 0 0 3px rgba(127, 29, 29, 0.2);
        }

        button[type='submit'] {
          height: 50px;
          border: none;
          border-radius: 14px;
          padding: 0 24px;
          cursor: pointer;
          color: #ffffff;
          font-weight: 700;
          font-size: 14px;
          background: linear-gradient(135deg, var(--primary), var(--accent));
          transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
        }

        button[type='submit']:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 18px rgba(107, 31, 42, 0.3);
          filter: saturate(1.05);
        }

        button[type='submit']:active {
          transform: translateY(0);
        }

        button[type='submit']:disabled {
          cursor: not-allowed;
          opacity: 0.72;
          transform: none;
          box-shadow: none;
        }

        .error-message {
          margin: 0;
          min-height: 20px;
          color: #fb7185;
          font-size: 13px;
        }

        .reveal {
          margin-top: 18px;
          border-radius: 18px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(127, 29, 29, 0.09);
          border: 1px solid rgba(107, 31, 42, 0.25);
        }

        .reveal-spinner {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 3px solid rgba(107, 31, 42, 0.24);
          border-top-color: rgba(107, 31, 42, 0.95);
          animation: spin 0.85s linear infinite;
        }

        .reveal-text {
          margin: 0;
          color: #6b1f2a;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.01em;
        }

        .result {
          margin-top: 18px;
          border-radius: 18px;
          padding: 16px;
          background: rgba(255, 249, 242, 0.88);
          border: 1px solid rgba(107, 31, 42, 0.24);
        }

        .result.result-reveal {
          animation: resultReveal 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
        }

        .result-label {
          margin: 0 0 6px;
          color: #6b1f2a;
          font-size: 13px;
        }

        .result h2 {
          margin: 0;
          color: #7f1d1d;
          font-size: clamp(22px, 3.5vw, 28px);
        }

        .result-meta {
          margin: 8px 0 0;
          color: #7a2d2d;
          font-size: 12px;
        }

        .actions {
          margin-top: 18px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px 14px;
        }

        .ghost-btn {
          border: 1px solid rgba(107, 31, 42, 0.3);
          color: #6b1f2a;
          background: rgba(255, 251, 247, 0.78);
          height: 40px;
          padding: 0 16px;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;
        }

        .ghost-btn:hover {
          border-color: rgba(107, 31, 42, 0.75);
          color: #ffffff;
          background: rgba(107, 31, 42, 0.92);
        }

        :global(body.popup-open) {
          overflow: hidden;
        }

        .surprise-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          padding: 24px;
          background: radial-gradient(circle at 20% 10%, rgba(255, 255, 255, 0.22), transparent 38%),
            radial-gradient(circle at 80% 88%, rgba(255, 221, 221, 0.22), transparent 40%),
            linear-gradient(160deg, rgba(76, 17, 25, 0.94), rgba(58, 12, 20, 0.95));
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.25s ease;
        }

        .surprise-overlay.is-visible {
          opacity: 1;
          pointer-events: auto;
        }

        .surprise-box {
          position: relative;
          width: min(620px, 100%);
          text-align: center;
          color: #fff9f4;
          padding: clamp(26px, 4vw, 38px);
          border-radius: 28px;
          background: linear-gradient(140deg, rgba(186, 64, 79, 0.9), rgba(107, 31, 42, 0.92)),
            url('https://hebbkx1anhila5yf.public.blob.vercel-storage.com/card-background-CcOvGX39n74239YfphrrKAPJHoXonk.png')
              center/cover no-repeat;
          border: 1px solid rgba(255, 231, 220, 0.35);
          box-shadow: 0 28px 55px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.28);
          transform: translateY(14px) scale(0.98);
          opacity: 0;
          transition: transform 0.34s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.24s ease;
          overflow: hidden;
        }

        .surprise-overlay.is-visible .surprise-box {
          transform: translateY(0) scale(1);
          opacity: 1;
        }

        .surprise-box::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(
            170deg,
            rgba(255, 246, 238, 0.18),
            rgba(255, 255, 255, 0.04) 45%,
            rgba(33, 7, 13, 0.24)
          );
        }

        .surprise-box > * {
          position: relative;
          z-index: 1;
        }

        .surprise-tag {
          display: inline-block;
          margin: 0;
          padding: 6px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 233, 217, 0.35);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .surprise-box h2 {
          margin: 14px 0 8px;
          font-size: clamp(32px, 5vw, 46px);
          line-height: 1.05;
        }

        .surprise-desc {
          margin: 0;
          color: rgba(255, 245, 238, 0.92);
          font-size: 15px;
        }

        .surprise-visual {
          margin-top: 14px;
          display: grid;
          place-items: center;
          min-height: 128px;
        }

        .surprise-icon {
          width: 118px;
          height: 118px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          font-size: 66px;
          background: radial-gradient(circle at 30% 30%, #fff7f0, #ffe0cc);
          border: 1px solid rgba(255, 240, 229, 0.45);
          box-shadow: 0 16px 30px rgba(33, 7, 13, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.7);
          animation: popFloat 0.8s ease both;
        }

        .surprise-merchandise {
          margin: 8px 0 0;
          font-size: clamp(30px, 6vw, 50px);
          font-weight: 800;
          letter-spacing: 0.02em;
          text-shadow: 0 6px 14px rgba(33, 7, 13, 0.38);
        }

        .surprise-nik {
          margin: 10px 0 0;
          color: rgba(255, 245, 238, 0.92);
          font-size: 14px;
          font-weight: 500;
        }

        .close-surprise-btn {
          margin-top: 22px;
          height: 44px;
          border: none;
          border-radius: 12px;
          padding: 0 24px;
          background: linear-gradient(135deg, #fff3ec, #ffe1d1);
          color: #6b1f2a;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.2s ease;
        }

        .close-surprise-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 20px rgba(33, 7, 13, 0.28);
        }

        .surprise-confetti {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .surprise-confetti span {
          position: absolute;
          top: -30px;
          width: 10px;
          height: 18px;
          border-radius: 3px;
          opacity: 0.9;
          animation: confettiFall 3.4s linear infinite;
        }

        .surprise-confetti span:nth-child(1) {
          left: 10%;
          background: #ffedd5;
          animation-delay: 0s;
        }

        .surprise-confetti span:nth-child(2) {
          left: 24%;
          background: #fde68a;
          animation-delay: 0.3s;
        }

        .surprise-confetti span:nth-child(3) {
          left: 42%;
          background: #fbcfe8;
          animation-delay: 0.5s;
        }

        .surprise-confetti span:nth-child(4) {
          left: 57%;
          background: #bfdbfe;
          animation-delay: 0.2s;
        }

        .surprise-confetti span:nth-child(5) {
          left: 74%;
          background: #bbf7d0;
          animation-delay: 0.45s;
        }

        .surprise-confetti span:nth-child(6) {
          left: 88%;
          background: #fecaca;
          animation-delay: 0.15s;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes resultReveal {
          0% {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }
          70% {
            transform: translateY(-2px) scale(1.01);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes confettiFall {
          0% {
            transform: translateY(-20px) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 0.95;
          }
          100% {
            transform: translateY(470px) rotate(320deg);
            opacity: 0;
          }
        }

        @keyframes popFloat {
          0% {
            opacity: 0;
            transform: translateY(10px) scale(0.9);
          }
          70% {
            opacity: 1;
            transform: translateY(-4px) scale(1.04);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @media (max-width: 560px) {
          :global(body) {
            padding: 14px;
          }

          .card {
            padding: 22px;
            border-radius: 18px;
          }

          button[type='submit'] {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
