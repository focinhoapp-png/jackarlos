import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, AlertCircle } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
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

      if (error) {
        throw error;
      }

      // Login successful
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Elemento de fundo sutil */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-success/5 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-[400px] z-10">
        <div className="flex flex-col items-center mb-6">
          <div className="h-48 w-48 flex items-center justify-center -mb-6">
            <img src="/logojt.PNG" alt="Logo Jackarlo" className="w-full h-full object-contain" />
          </div>
        </div>

        <div className="bg-card border border-border p-8 rounded-2xl shadow-xl shadow-primary/5">
          {error && (
            <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="user">Usuário</Label>
              <Input
                id="user"
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="joao26"
                className="h-11 bg-background/50 focus:bg-background transition-colors"
                disabled={isLoading}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 bg-background/50 focus:bg-background transition-colors"
                disabled={isLoading}
              />
            </div>

            <div className="flex items-center space-x-2">
              <input 
                type="checkbox" 
                id="remember" 
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded border-border bg-background text-primary focus:ring-primary h-4 w-4"
                disabled={isLoading}
              />
              <Label htmlFor="remember" className="font-normal cursor-pointer text-muted-foreground">
                Lembrar usuário
              </Label>
            </div>

            <Button type="submit" className="w-full h-11 text-base font-medium" disabled={isLoading}>
              {isLoading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </div>
        
        <div className="text-center mt-8">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Jackarlos Transportes. Todos os direitos reservados.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Desenvolvido por Ruan Ennes
          </p>
        </div>
      </div>
    </div>
  );
}
