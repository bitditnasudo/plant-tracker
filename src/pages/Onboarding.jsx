import { useState } from 'react'
import {
  ChevronRight, MapPin, LocateFixed, Search, Upload, Loader2,
  AppWindow, Square, Ruler, CloudRain, Plus, Check, Cloud,
} from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { signIn } from '../lib/googleDrive.js'
import { searchCity, getBrowserLocation } from '../lib/weather.js'
import { fileToPlanImage } from '../lib/planFile.js'
import { Avatar, Sprout, WateringCan } from '../components/PlantIcons.jsx'

// First-launch wizard: profile → location → floor plan → orientation → tool tour.
export default function Onboarding() {
  const { state, setProfile, setSettings, setPlan, savePlanImage, planImage } = useStore()
  const [step, setStep] = useState(0)

  // location step
  const [cityQuery, setCityQuery] = useState('')
  const [cityResults, setCityResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [locError, setLocError] = useState(null)

  // plan step
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  const hasPlan = !!planImage
  // orientation step only exists when a plan was uploaded
  const steps = hasPlan ? ['welcome', 'location', 'plan', 'north', 'guide'] : ['welcome', 'location', 'plan', 'guide']
  const current = steps[Math.min(step, steps.length - 1)]
  const next = () => setStep(s => s + 1)

  const findCity = async () => {
    if (!cityQuery.trim()) return
    setBusy(true)
    setLocError(null)
    try {
      const results = await searchCity(cityQuery.trim())
      setCityResults(results)
      if (results.length === 0) setLocError('No matching city found.')
    } catch (e) {
      setLocError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const useGPS = async () => {
    setBusy(true)
    setLocError(null)
    try {
      setSettings({ location: await getBrowserLocation() })
      setCityResults(null)
    } catch {
      setLocError('Could not get your position — search for your city instead.')
    } finally {
      setBusy(false)
    }
  }

  const onFile = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const { dataUrl, width, height } = await fileToPlanImage(file)
      await savePlanImage(dataUrl, width, height)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="app-shell">
      <div className="bg-blobs" />
      <div className="main-content narrow" style={{ display: 'flex', flexDirection: 'column', paddingBottom: 24 }}>

        {/* progress dots */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '10px 0 18px' }}>
          {steps.map((s, i) => (
            <span key={s} style={{
              width: i === step ? 22 : 8, height: 8, borderRadius: 99,
              background: i <= step ? 'var(--olive)' : 'var(--mint)',
              opacity: i <= step ? 1 : 0.4, transition: 'all .25s ease',
            }} />
          ))}
        </div>

        {current === 'welcome' && (
          <div className="center" style={{ margin: 'auto 0' }}>
            <div style={{ width: 110, height: 110, margin: '0 auto 14px' }}><Sprout /></div>
            <h2 style={{ fontSize: 26, marginBottom: 6 }}>Welcome to Plant Tracker</h2>
            <p className="muted" style={{ maxWidth: 290, margin: '0 auto 24px' }}>
              Map your home, place your plants, and never miss a watering — rain included.
            </p>
            <div className="field" style={{ maxWidth: 280, margin: '0 auto', textAlign: 'left' }}>
              <label>What should we call you?</label>
              <input
                value={state.profile.name} placeholder="Your name" autoFocus
                onChange={e => setProfile({ name: e.target.value })}
              />
            </div>
            <button className="btn btn-primary btn-block" style={{ maxWidth: 280 }} onClick={next}>
              Let’s go <ChevronRight size={16} />
            </button>
            <button className="btn btn-ghost btn-block" style={{ maxWidth: 280, marginTop: 10 }} onClick={signIn}>
              <Cloud size={16} /> I already use Plant Tracker
            </button>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
              Sign in with Google to restore your plants and floor plan from Drive — no setup needed.
            </p>
          </div>
        )}

        {current === 'location' && (
          <div style={{ margin: 'auto 0' }}>
            <div className="center">
              <div className="row-icon" style={{ width: 64, height: 64, margin: '0 auto 12px' }}><MapPin size={30} /></div>
              <h2 style={{ marginBottom: 6 }}>Where are your plants?</h2>
              <p className="muted" style={{ maxWidth: 300, margin: '0 auto 20px' }}>
                Your location powers the weather card and the rain check for outdoor plants. It never leaves this device.
              </p>
            </div>
            <button className="btn btn-mint btn-block" onClick={useGPS} disabled={busy}>
              {busy ? <Loader2 size={16} className="spin" /> : <LocateFixed size={16} />} Use my current position
            </button>
            <p className="muted center" style={{ margin: '10px 0' }}>or</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="search-bar" style={{ flex: 1, marginBottom: 0 }}>
                <Search size={15} />
                <input
                  placeholder="Search city…" value={cityQuery}
                  onChange={e => setCityQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && findCity()}
                />
              </div>
              <button className="btn btn-ghost" onClick={findCity} disabled={busy || !cityQuery.trim()}>Find</button>
            </div>
            <div style={{ marginTop: 8 }}>
              {cityResults?.map(r => (
                <button
                  key={`${r.lat},${r.lon}`} className="chip" style={{ margin: '4px 6px 0 0' }}
                  onClick={() => { setSettings({ location: r }); setCityResults(null); setCityQuery('') }}
                >
                  <MapPin size={12} /> {r.label}
                </button>
              ))}
            </div>
            {state.settings.location && (
              <p className="center" style={{ marginTop: 12, fontWeight: 700, color: 'var(--olive)' }}>
                <Check size={14} /> {state.settings.location.label}
              </p>
            )}
            {locError && <p className="center" style={{ color: 'var(--red)', marginTop: 8, fontSize: 13 }}>{locError}</p>}
            <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={next}>
              {state.settings.location ? 'Continue' : 'Skip for now'} <ChevronRight size={16} />
            </button>
          </div>
        )}

        {current === 'plan' && (
          <div style={{ margin: 'auto 0' }}>
            <div className="center">
              <div className="row-icon" style={{ width: 64, height: 64, margin: '0 auto 12px' }}><Upload size={28} /></div>
              <h2 style={{ marginBottom: 6 }}>Add your floor plan</h2>
              <p className="muted" style={{ maxWidth: 300, margin: '0 auto 20px' }}>
                Upload your house or apartment plan as <b>PDF or SVG</b> (PNG/JPG work too). You’ll place each plant on it and map windows and light.
              </p>
            </div>
            {hasPlan ? (
              <div className="card center">
                <img src={planImage} alt="Floor plan" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 10 }} />
                <p style={{ fontWeight: 700, color: 'var(--olive)', marginTop: 8 }}><Check size={14} /> Plan loaded</p>
              </div>
            ) : (
              <label className="btn btn-mint btn-block" style={{ cursor: 'pointer' }}>
                {uploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                {uploading ? 'Processing…' : 'Choose file'}
                <input type="file" accept=".pdf,.svg,image/*" hidden onChange={onFile} disabled={uploading} />
              </label>
            )}
            {uploadError && <p className="center" style={{ color: 'var(--red)', marginTop: 8, fontSize: 13 }}>{uploadError}</p>}
            <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={next}>
              {hasPlan ? 'Continue' : 'Skip — add it later in the Plan tab'} <ChevronRight size={16} />
            </button>
          </div>
        )}

        {current === 'north' && (
          <div style={{ margin: 'auto 0' }}>
            <div className="center">
              <h2 style={{ marginBottom: 6 }}>Which way is North?</h2>
              <p className="muted" style={{ maxWidth: 300, margin: '0 auto 6px' }}>
                Rotate the arrow until it points to real-world North on your plan. This tells the app which windows get morning or afternoon sun.
              </p>
              <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
                Tip: most architectural plans include a North arrow — copy it.
              </p>
              <div style={{ position: 'relative', display: 'inline-block', margin: '0 auto' }}>
                <img src={planImage} alt="Floor plan" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 10, opacity: 0.85 }} />
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 54, color: 'var(--red)', rotate: `${state.plan.northDeg}deg`,
                  textShadow: '0 2px 8px rgba(255,255,255,.9)',
                }}>⬆</div>
              </div>
              <div style={{ fontWeight: 800, margin: '8px 0' }}>{state.plan.northDeg}°</div>
            </div>
            <input
              type="range" min="0" max="359" step="1" value={state.plan.northDeg}
              style={{ width: '100%' }}
              onChange={e => setPlan({ northDeg: +e.target.value })}
            />
            <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={next}>
              Continue <ChevronRight size={16} />
            </button>
          </div>
        )}

        {current === 'guide' && (
          <div style={{ margin: 'auto 0' }}>
            <div className="center">
              <div style={{ width: 84, height: 84, margin: '0 auto 10px', borderRadius: '50%', overflow: 'hidden', border: '3px solid var(--olive)' }}>
                <Avatar style={{ width: '100%', height: '100%' }} />
              </div>
              <h2 style={{ marginBottom: 14 }}>You’re set{state.profile.name ? `, ${state.profile.name}` : ''}!</h2>
            </div>
            <div className="card row-list">
              <div className="row">
                <div className="row-icon"><Plus size={18} /></div>
                <div className="grow">Tap the <b>＋ button</b> to add plants from the catalogue.</div>
              </div>
              <div className="row">
                <div className="row-icon"><AppWindow size={18} /></div>
                <div className="grow">In the <b>Plan</b> tab, use <b>Windows</b> to mark windows and <b>Light zones</b> to tag each room’s light.</div>
              </div>
              <div className="row">
                <div className="row-icon"><Ruler size={18} /></div>
                <div className="grow"><b>Set scale</b>: tap the two ends of a wall you know the length of — then you can measure anything.</div>
              </div>
              <div className="row">
                <div className="row-icon" style={{ width: 38, height: 38 }}><WateringCan /></div>
                <div className="grow">Press and <b>hold a plant until it shakes</b> to move it around the plan.</div>
              </div>
              <div className="row">
                <div className="row-icon"><CloudRain size={18} /></div>
                <div className="grow">After a rainy day, outdoor plants show a <b>red bubble</b> — tell the app if they got wet and the schedule adapts.</div>
              </div>
            </div>
            <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={() => setSettings({ onboardingDone: true })}>
              Start tracking <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
