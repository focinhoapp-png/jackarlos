/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Carregamento imediato — necessário para o primeiro render
import { LoginPage } from './pages/Login';

// Lazy loading — cada página só é baixada quando o usuário navegar até ela
const AdminLayout   = lazy(() => import('./layouts/AdminLayout').then(m => ({ default: m.AdminLayout })));
const Dashboard     = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const ScannerPanel  = lazy(() => import('./pages/ScannerPanel').then(m => ({ default: m.ScannerPanel })));
const History       = lazy(() => import('./pages/History').then(m => ({ default: m.History })));
const TVPanel       = lazy(() => import('./pages/TVPanel').then(m => ({ default: m.TVPanel })));
const DriverPanel   = lazy(() => import('./pages/DriverPanel').then(m => ({ default: m.DriverPanel })));
const Entregadores  = lazy(() => import('./pages/Entregadores').then(m => ({ default: m.Entregadores })));
const Conferentes   = lazy(() => import('./pages/Conferentes').then(m => ({ default: m.Conferentes })));
const Empresas      = lazy(() => import('./pages/Empresas').then(m => ({ default: m.Empresas })));
const Financeiro    = lazy(() => import('./pages/Financeiro').then(m => ({ default: m.Financeiro })));
const Relatorios    = lazy(() => import('./pages/Relatorios').then(m => ({ default: m.Relatorios })));
const Pagamentos    = lazy(() => import('./pages/Pagamentos').then(m => ({ default: m.Pagamentos })));
const Ranking       = lazy(() => import('./pages/Ranking').then(m => ({ default: m.Ranking })));
const Configuracoes = lazy(() => import('./pages/Configuracoes').then(m => ({ default: m.Configuracoes })));
const Usuarios      = lazy(() => import('./pages/Usuarios').then(m => ({ default: m.Usuarios })));
const Estoque       = lazy(() => import('./pages/Estoque').then(m => ({ default: m.Estoque })));
const Rotas         = lazy(() => import('./pages/Rotas').then(m => ({ default: m.Rotas })));
const Logs          = lazy(() => import('./pages/Logs').then(m => ({ default: m.Logs })));
const Entregas      = lazy(() => import('./pages/Entregas').then(m => ({ default: m.Entregas })));
const Despesas      = lazy(() => import('./pages/Despesas').then(m => ({ default: m.Despesas })));

// Fallback exibido enquanto um chunk está sendo baixado
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route path="/admin/tv" element={<TVPanel />} />

          <Route path="/driver/dashboard" element={<div className="bg-background min-h-screen text-foreground p-4"><DriverPanel /></div>} />

          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/detalhamento" replace />} />
            {/* Aliases para compatibilidade com links antigos */}
            <Route path="dashboard"  element={<Navigate to="/admin/detalhamento" replace />} />
            <Route path="scanner"    element={<Navigate to="/admin/carregamentos" replace />} />
            <Route path="history"    element={<Navigate to="/admin/historico" replace />} />
            <Route path="config"     element={<Navigate to="/admin/meus-dados" replace />} />
            {/* Rotas principais */}
            <Route path="detalhamento"  element={<Dashboard />} />
            <Route path="carregamentos" element={<ScannerPanel />} />
            <Route path="historico"     element={<History />} />
            <Route path="entregadores"  element={<Entregadores />} />
            <Route path="estoque"       element={<Estoque />} />
            <Route path="conferentes"   element={<Conferentes />} />
            <Route path="empresas"      element={<Empresas />} />
            <Route path="rotas"         element={<Rotas />} />
            <Route path="financeiro"    element={<Financeiro />} />
            <Route path="pagamentos"    element={<Pagamentos />} />
            <Route path="relatorios"    element={<Relatorios />} />
            <Route path="ranking"       element={<Ranking />} />
            <Route path="meus-dados"    element={<Configuracoes />} />
            <Route path="usuarios"      element={<Usuarios />} />
            <Route path="logs"          element={<Logs />} />
            <Route path="entregas"      element={<Entregas />} />
            <Route path="despesas"      element={<Despesas />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
