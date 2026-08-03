import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Lock, User } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('jackarlos_remembered_user');
    if (savedUser) {
      setEmail(savedUser);
      setRemember(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: `${email.trim()}@jackarlo.com`,
        password,
      });

      if (error) throw error;

      if (remember) {
        localStorage.setItem('jackarlos_remembered_user', email.trim());
      } else {
        localStorage.removeItem('jackarlos_remembered_user');
      }

      navigate('/admin/dashboard');
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Erro ao realizar login. Verifique suas credenciais.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100svh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(160deg, #1e2d45 0%, #2f4869 50%, #1a2535 100%)',
      padding: '24px 20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Círculos de fundo decorativos */}
      <div style={{
        position: 'absolute', top: '-20%', right: '-15%',
        width: '60%', paddingBottom: '60%',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-25%', left: '-20%',
        width: '70%', paddingBottom: '70%',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Container principal */}
      <div style={{ width: '100%', maxWidth: '380px', position: 'relative', zIndex: 1 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <picture>
            <source srcSet="/logojt.webp" type="image/webp" />
            <img
              src="/logojt.PNG"
              alt="Logo Jackarlo's"
              width="130"
              height="130"
              fetchPriority="high"
              decoding="async"
              style={{
                width: '130px',
                height: '130px',
                objectFit: 'contain',
                filter: 'brightness(0) invert(1)',
                display: 'inline-block',
              }}
            />
          </picture>
        </div>

        {/* Card do formulário */}
        <div style={{
          background: 'rgba(255,255,255,0.07)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '24px',
          padding: '32px 28px',
          boxShadow: '0 25px 50px rgba(0,0,0,0.35)',
        }}>
          <h1 style={{
            color: '#ffffff',
            fontSize: '22px',
            fontWeight: 700,
            marginBottom: '6px',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            Bem-vindo de volta
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.5)',
            fontSize: '14px',
            marginBottom: '28px',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            Acesse sua conta para continuar
          </p>

          {/* Erro */}
          {error && (
            <div style={{
              marginBottom: '20px',
              padding: '12px 14px',
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              color: '#fca5a5',
              fontSize: '13px',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              <AlertCircle size={16} style={{ marginTop: '1px', flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            {/* Campo Usuário */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                color: 'rgba(255,255,255,0.7)',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: '8px',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                Usuário
              </label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{
                  position: 'absolute', left: '14px', top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'rgba(255,255,255,0.35)',
                }} />
                <input
                  id="user"
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="joao26"
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    height: '48px',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '12px',
                    color: '#ffffff',
                    fontSize: '15px',
                    paddingLeft: '42px',
                    paddingRight: '16px',
                    outline: 'none',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = 'rgba(255,255,255,0.35)';
                    e.target.style.background = 'rgba(255,255,255,0.12)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = 'rgba(255,255,255,0.12)';
                    e.target.style.background = 'rgba(255,255,255,0.08)';
                  }}
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                color: 'rgba(255,255,255,0.7)',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: '8px',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                Senha
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{
                  position: 'absolute', left: '14px', top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'rgba(255,255,255,0.35)',
                }} />
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    height: '48px',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '12px',
                    color: '#ffffff',
                    fontSize: '15px',
                    paddingLeft: '42px',
                    paddingRight: '16px',
                    outline: 'none',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = 'rgba(255,255,255,0.35)';
                    e.target.style.background = 'rgba(255,255,255,0.12)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = 'rgba(255,255,255,0.12)';
                    e.target.style.background = 'rgba(255,255,255,0.08)';
                  }}
                />
              </div>
            </div>

            {/* Lembrar usuário */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '28px',
            }}>
              <input
                type="checkbox"
                id="remember"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                disabled={isLoading}
                style={{
                  width: '18px', height: '18px',
                  accentColor: '#60a5fa',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              />
              <label htmlFor="remember" style={{
                color: 'rgba(255,255,255,0.55)',
                fontSize: '13px',
                cursor: 'pointer',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                Lembrar usuário
              </label>
            </div>

            {/* Botão Entrar */}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                height: '50px',
                background: isLoading
                  ? 'rgba(255,255,255,0.1)'
                  : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                border: 'none',
                borderRadius: '14px',
                color: '#ffffff',
                fontSize: '16px',
                fontWeight: 600,
                fontFamily: 'Inter, system-ui, sans-serif',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'opacity 0.2s, transform 0.1s',
                boxShadow: isLoading ? 'none' : '0 4px 20px rgba(37,99,235,0.4)',
              }}
              onMouseDown={e => { if (!isLoading) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)'; }}
              onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
            >
              {isLoading ? (
                <>
                  <div style={{
                    width: '18px', height: '18px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                  }} />
                  Entrando...
                </>
              ) : 'Entrar'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '28px' }}>
          <p style={{
            color: 'rgba(255,255,255,0.25)',
            fontSize: '11px',
            fontFamily: 'Inter, system-ui, sans-serif',
            lineHeight: 1.6,
          }}>
            © {new Date().getFullYear()} Jackarlos Transportes. Todos os direitos reservados.<br />
            Desenvolvido por Ruan Ennes
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: rgba(255,255,255,0.25); }
        input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 100px rgba(47,72,105,0.9) inset !important;
          -webkit-text-fill-color: #ffffff !important;
        }
      `}</style>
    </div>
  );
}
