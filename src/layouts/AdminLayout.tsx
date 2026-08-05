import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  Truck, 
  ScanLine, 
  DollarSign, 
  BarChart3, 
  History, 
  Trophy, 
  MonitorPlay, 
  Settings, 
  ShieldCheck, 
  DatabaseBackup,
  UserCircle,
  Package,
  LogOut,
  Bell,
  Search,
  Menu,
  X,
  IdCard,
  Map,
  ClipboardList,
  Wallet,
  Receipt
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Button } from '@/src/components/ui/button';
import { supabase } from '@/src/lib/supabase';

const navItems = [
  { icon: LayoutDashboard, label: 'Detalhamento', path: '/admin/detalhamento' },
  { icon: ScanLine, label: 'Carregamentos', path: '/admin/carregamentos' },
  { icon: Users, label: 'Entregadores', path: '/admin/entregadores' },
  { icon: Package, label: 'Estoque', path: '/admin/estoque' },
  { icon: ShieldCheck, label: 'Conferentes', path: '/admin/conferentes' },
  { icon: Building2, label: 'Empresas', path: '/admin/empresas' },
  { icon: Map, label: 'Rotas', path: '/admin/rotas' },
  { icon: DollarSign, label: 'Financeiro', path: '/admin/financeiro' },
  { icon: Wallet, label: 'Pagamentos', path: '/admin/pagamentos' },
  { icon: Receipt, label: 'Despesas', path: '/admin/despesas', adminOnly: true },
  { icon: BarChart3, label: 'Relatórios', path: '/admin/relatorios' },
  { icon: History, label: 'Histórico', path: '/admin/historico' },
  { icon: Trophy, label: 'Ranking', path: '/admin/ranking' },
  { icon: MonitorPlay, label: 'Painel TV', path: '/admin/tv' },
  { icon: Truck, label: 'Minhas Entregas', path: '/admin/entregas' },
];

const configItems = [
  { icon: IdCard, label: 'Meus Dados', path: '/admin/meus-dados' },
  { icon: Users, label: 'Administradores', path: '/admin/usuarios' },
  { icon: ClipboardList, label: 'Logs', path: '/admin/logs' },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ name: string; role: string; avatar_url?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Load logged-in user data
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const userId = data.session?.user?.id;
      if (userId) {
        const { data: userData } = await supabase
          .from('users')
          .select('name, role, avatar_url')
          .eq('id', userId)
          .single();
        if (userData) {
          setCurrentUser({ name: userData.name, role: userData.role, avatar_url: userData.avatar_url });
        }
      }
      setIsLoading(false);
    });
  }, []);

  const filteredNavItems = navItems.filter((item: any) => {
    if (currentUser?.role === 'ENTREGADOR') {
      return ['Minhas Entregas', 'Detalhamento', 'Relatórios', 'Histórico'].includes(item.label);
    }
    if (currentUser?.role === 'CONFERENTE') {
      return ['Detalhamento', 'Carregamentos', 'Estoque', 'Histórico'].includes(item.label);
    }
    // Admin: mostra tudo exceto 'Minhas Entregas'; adminOnly items só para ADMIN
    if (item.adminOnly && currentUser?.role !== 'ADMIN') return false;
    return item.label !== 'Minhas Entregas';
  });

  const filteredConfigItems = configItems.filter(item => {
    if (currentUser?.role === 'ENTREGADOR' || currentUser?.role === 'CONFERENTE') {
      return item.label === 'Meus Dados';
    }
    return true;
  });

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-background flex flex-col items-center justify-center">
        <img src="/logotipo.PNG" alt="Logo" className="h-16 w-auto object-contain mb-8 animate-pulse opacity-50" />
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <p className="text-sm font-medium text-muted-foreground animate-pulse">
            Carregando painel...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden relative">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-[280px] lg:w-64 border-r border-border bg-card flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static shadow-2xl lg:shadow-none",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-base tracking-tight text-foreground truncate">Painel de Controle</span>
            <img src="/logotipo.PNG" alt="Logo" className="h-8 w-auto object-contain shrink-0" />
          </div>
          <button className="lg:hidden p-2 -mr-2 text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-8 custom-scrollbar">
          
          <div>
            <nav className="space-y-1">
              {filteredNavItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-md text-sm transition-colors border",
                      isActive 
                        ? "bg-secondary text-secondary-foreground font-medium border-border" 
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground border-transparent"
                    )
                  }
                >
                  <item.icon className="h-5 w-5 md:h-4 md:w-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div>
            <p className="ml-2 mb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Sistema
            </p>
            <nav className="space-y-1">
              {filteredConfigItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-md text-sm transition-colors border",
                      isActive 
                        ? "bg-secondary text-secondary-foreground font-medium border-border" 
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground border-transparent"
                    )
                  }
                >
                  <item.icon className="h-5 w-5 md:h-4 md:w-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          
        </div>

        <div className="p-4 border-t border-border shrink-0">
          <div 
            className="flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-md hover:bg-accent transition-colors cursor-pointer"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate('/login');
            }}
          >
            <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center shrink-0 border border-border overflow-hidden">
              {currentUser?.avatar_url ? (
                <img src={currentUser.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <UserCircle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground truncate">{currentUser?.name || '...'}</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {currentUser?.role === 'ADMIN' ? 'Administrador' : currentUser?.role === 'CONFERENTE' ? 'Conferente' : currentUser?.role === 'ENTREGADOR' ? 'Entregador' : 'Usuário'}
              </p>
            </div>
            <LogOut className="h-5 w-5 md:h-4 md:w-4 text-muted-foreground" />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto w-full relative">
        {/* Mobile Header */}
        <header className="h-16 border-b border-border bg-card flex items-center px-4 lg:hidden shrink-0 sticky top-0 z-10 w-full justify-between">
          <div className="flex items-center gap-3">
            <button 
              className="p-2 -ml-2 text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-accent"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <span className="font-bold text-lg tracking-tight text-foreground">Painel Jackarlos</span>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 bg-background p-4 lg:p-6 w-full">
          <div className="mx-auto max-w-7xl w-full">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
