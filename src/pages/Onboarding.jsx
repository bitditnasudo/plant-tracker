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
      {/* .onboarding, not plain .main-content: this renders INSTEAD of the shell,
          so there is no floating nav to clear and the 104px bottom reservation
          would leave a dead band under the button on every step. */}
      <div className="main-content is-narrow onboarding">

        {/* Progress. Every step up to the current one is filled, so the bar
            reads as distance travelled rather than as a lone marker. */}
        <div className="steps">
          {steps.map((s, i) => (
            <span key={s} className={`step-dot${i <= step ? ' is-active' : ''}`} />
          ))}
        </div>

        {current === 'welcome' && (
          <div className="center ob-step">
            <div className="mark-lg"><Sprout /></div>
            <h2 className="auth-title">Welcome to Plant Tracker</h2>
            <p className="muted prose-tight center ob-lead">
              Map your home, place your plants, and never miss a watering — rain included.
            </p>
            <div className="field ob-field">
              <label>What should we call you?</label>
              <input
                value={state.profile.name} placeholder="Your name" autoFocus
                onChange={e => setProfile({ name: e.target.value })}
              />
            </div>
            <div className="ob-cta">
              <button className="btn btn-primary btn-block ob-btn" onClick={next}>
                Let’s go <ChevronRight size={16} />
              </button>
              <button className="btn btn-secondary btn-block ob-btn ob-gap" onClick={signIn}>
                <Cloud size={16} /> I already use Plant Tracker
              </button>
              <p className="field-note">
                Sign in with Google to restore your plants and floor plan from Drive — no setup needed.
              </p>
            </div>
          </div>
        )}

        {current === 'location' && (
          <div className="ob-step">
            <div className="center">
              <div className="row-icon icon-lead"><MapPin size={30} /></div>
              <h2 className="ob-mark">Where are your plants?</h2>
              <p className="muted prose-tight center ob-lead">
                Your location powers the weather card and the rain check for outdoor plants. It never leaves this device.
              </p>
            </div>
            <button className="btn btn-soft btn-block" onClick={useGPS} disabled={busy}>
              {busy ? <Loader2 size={16} className="spin" /> : <LocateFixed size={16} />} Use my current position
            </button>
            <p className="muted center ob-or">or</p>
            <div className="inline-actions">
              <div className="search-bar search-bar-inline">
                <Search size={15} />
                <input
                  placeholder="Search city…" value={cityQuery}
                  onChange={e => setCityQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && findCity()}
                />
              </div>
              <button className="btn btn-secondary" onClick={findCity} disabled={busy || !cityQuery.trim()}>Find</button>
            </div>
            <div className="result-chips">
              {cityResults?.map(r => (
                <button
                  key={`${r.lat},${r.lon}`} className="chip"
                  onClick={() => { setSettings({ location: r }); setCityResults(null); setCityQuery('') }}
                >
                  <MapPin size={12} /> {r.label}
                </button>
              ))}
            </div>
            {state.settings.location && (
              <p className="center ok-line">
                <Check size={14} /> {state.settings.location.label}
              </p>
            )}
            {locError && <p className="center note-danger">{locError}</p>}
            <button className="btn btn-primary btn-block ob-cta ob-cta-gap" onClick={next}>
              {state.settings.location ? 'Continue' : 'Skip for now'} <ChevronRight size={16} />
            </button>
          </div>
        )}

        {current === 'plan' && (
          <div className="ob-step">
            <div className="center">
              <div className="row-icon icon-lead"><Upload size={28} /></div>
              <h2 className="ob-mark">Add your floor plan</h2>
              <p className="muted prose-tight center ob-lead">
                Upload your house or apartment plan as <b>PDF or SVG</b> (PNG/JPG work too). You’ll place each plant on it and map windows and light.
              </p>
            </div>
            {hasPlan ? (
              <div className="card center">
                <img src={planImage} alt="Floor plan" className="plan-preview" />
                <p className="ok-line"><Check size={14} /> Plan loaded</p>
              </div>
            ) : (
              <label className="btn btn-soft btn-block as-file">
                {uploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                {uploading ? 'Processing…' : 'Choose file'}
                <input type="file" accept=".pdf,.svg,image/*" hidden onChange={onFile} disabled={uploading} />
              </label>
            )}
            {uploadError && <p className="center note-danger">{uploadError}</p>}
            <button className="btn btn-primary btn-block ob-cta ob-cta-gap" onClick={next}>
              {hasPlan ? 'Continue' : 'Skip — add it later in the Plan tab'} <ChevronRight size={16} />
            </button>
          </div>
        )}

        {current === 'north' && (
          <div className="ob-step">
            <div className="center">
              <h2 className="ob-mark">Which way is North?</h2>
              <p className="muted prose-tight center">
                Rotate the arrow until it points to real-world North on your plan. This tells the app which windows get morning or afternoon sun.
              </p>
              <p className="field-note ob-lead">
                Tip: most architectural plans include a North arrow — copy it.
              </p>
              <div className="north-stage">
                <img src={planImage} alt="Floor plan" className="plan-preview plan-preview-lg" />
                <div className="north-dial-lg" style={{ rotate: `${state.plan.northDeg}deg` }}>⬆</div>
              </div>
              <div className="north-value north-readout">{state.plan.northDeg}°</div>
            </div>
            <input
              type="range" min="0" max="359" step="1" value={state.plan.northDeg} className="range"
              onChange={e => setPlan({ northDeg: +e.target.value })}
            />
            <button className="btn btn-primary btn-block ob-cta ob-cta-gap" onClick={next}>
              Continue <ChevronRight size={16} />
            </button>
          </div>
        )}

        {current === 'guide' && (
          <div className="ob-step">
            <div className="center">
              <div className="avatar-md"><Avatar /></div>
              <h2 className="ob-lead">You’re set{state.profile.name ? `, ${state.profile.name}` : ''}!</h2>
            </div>
            <div className="card">
              <div className="list-row">
                <div className="row-icon"><Plus size={18} /></div>
                <div className="grow">Tap the <b>＋ button</b> to add plants from the catalogue.</div>
              </div>
              <div className="list-row">
                <div className="row-icon"><AppWindow size={18} /></div>
                <div className="grow">In the <b>Plan</b> tab, use <b>Windows</b> to mark windows and <b>Light zones</b> to tag each room’s light.</div>
              </div>
              <div className="list-row">
                <div className="row-icon"><Ruler size={18} /></div>
                <div className="grow"><b>Set scale</b>: tap the two ends of a wall you know the length of — then you can measure anything.</div>
              </div>
              <div className="list-row">
                <div className="row-icon"><WateringCan className="art-md" /></div>
                <div className="grow">Press and <b>hold a plant until it shakes</b> to move it around the plan.</div>
              </div>
              <div className="list-row">
                <div className="row-icon"><CloudRain size={18} /></div>
                <div className="grow">After a rainy day, outdoor plants show a <b>red bubble</b> — tell the app if they got wet and the schedule adapts.</div>
              </div>
            </div>
            <button className="btn btn-primary btn-block ob-cta ob-cta-gap" onClick={() => setSettings({ onboardingDone: true })}>
              Start tracking <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
