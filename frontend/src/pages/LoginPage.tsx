import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { login as apiLogin } from '../api/auth'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await apiLogin(username, password)
      login(data.access_token, { username, role: data.role })
      navigate('/')
    } catch {
      setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg,#143F5C 0%,#0C3C5D 60%,#082A40 100%)',
      }}
    >
      {/* Decorative glows */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          right: '-120px',
          top: '-80px',
          width: '440px',
          height: '440px',
          background: 'radial-gradient(circle,rgba(170,205,0,0.18),transparent 65%)',
        }}
      />
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          left: '-100px',
          bottom: '-60px',
          width: '320px',
          height: '320px',
          background: 'radial-gradient(circle,rgba(177,204,187,0.14),transparent 70%)',
        }}
      />

      <div
        className="relative bg-white rounded-2xl p-8 w-full max-w-sm"
        style={{
          border: '1px solid #E2E6EA',
          boxShadow: '0 24px 64px rgba(8,42,64,0.35)',
        }}
      >
        {/* Logo / title */}
        <div className="mb-7 text-center">
          <div className="inline-flex items-center justify-center mb-4">
            <img src="/moove-logo.png" alt="moove" className="h-9 w-auto" />
          </div>
          <p
            className="font-mono text-[10px] font-semibold uppercase mb-2 inline-block"
            style={{
              color: '#7B9400',
              letterSpacing: '0.16em',
              background: 'rgba(170,205,0,0.12)',
              padding: '3px 8px',
              borderRadius: 3,
              border: '1px solid rgba(170,205,0,0.3)',
            }}
          >
            RCCP One
          </p>
          <p className="text-[13px] mt-3" style={{ color: '#6B7A8A' }}>
            Capacity Planning · Gravesend UKP1
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12.5px] font-semibold mb-1.5" style={{ color: '#3F4D5B' }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 rounded-lg text-[14px] focus:outline-none focus:ring-2"
              style={{ border: '1px solid #CCD3DA', color: '#0F1A24' }}
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-semibold mb-1.5" style={{ color: '#3F4D5B' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg text-[14px] focus:outline-none focus:ring-2"
              style={{ border: '1px solid #CCD3DA', color: '#0F1A24' }}
            />
          </div>

          {error && (
            <p className="text-[12.5px] px-3 py-2 rounded-lg" style={{ background: '#FEE4D5', color: '#C2410C' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full text-white py-2 px-4 rounded-lg text-[13.5px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#0C3C5D' }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-[10.5px] font-mono uppercase tracking-widest" style={{ color: '#9CABB9' }}>
          v0.9 · Phase 1
        </p>
      </div>
    </div>
  )
}
