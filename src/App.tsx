/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Carregamento imediato — o layout principal e login nunca devem ser lazy
import { LoginPage } from './pages/Login';
import { AdminLayout } from './layouts/AdminLayout';
// Route guard — protege todas as áreas que exigem autenticação
import { ProtectedRoute } from './components/ProtectedRoute';

// Lazy loading — cada página só é baixada quando o usuário navegar até ela
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

// Spinner exibido na área de conteúdo enquanto a página carrega (sidebar fica visível)
function ContentLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Carregando...</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          {/* Rota pública */}
          <Route path="/login" element={<LoginPage />} />

          {/* Painel TV — protegido, mas fora do AdminLayout */}
          <Route path="/admin/tv" element={
            <ProtectedRoute>
              <TVPanel />
            </ProtectedRoute>
          } />

          {/* Painel do Entregador — protegido, layout próprio */}
          <Route path="/driver/dashboard" element={
            <ProtectedRoute>
              <div className="bg-background min-h-screen text-foreground p-4">
                <DriverPanel />
              </div>
            </ProtectedRoute>
          } />

          {/* Área Admin — ProtectedRoute envolve o layout inteiro */}
          <Route path="/admin" element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/admin/detalhamento" replace />} />
            {/* Aliases para compatibilidade com links antigos */}
            <Route path="dashboard"  element={<Navigate to="/admin/detalhamento" replace />} />
            <Route path="scanner"    element={<Navigate to="/admin/carregamentos" replace />} />
            <Route path="history"    element={<Navigate to="/admin/historico" replace />} />
            <Route path="config"     element={<Navigate to="/admin/meus-dados" replace />} />
            {/* Rotas principais — cada página lazy dentro de seu próprio Suspense */}
            <Route path="detalhamento"  element={<Suspense fallback={<ContentLoader />}><Dashboard /></Suspense>} />
            <Route path="carregamentos" element={<Suspense fallback={<ContentLoader />}><ScannerPanel /></Suspense>} />
            <Route path="historico"     element={<Suspense fallback={<ContentLoader />}><History /></Suspense>} />
            <Route path="entregadores"  element={<Suspense fallback={<ContentLoader />}><Entregadores /></Suspense>} />
            <Route path="estoque"       element={<Suspense fallback={<ContentLoader />}><Estoque /></Suspense>} />
            <Route path="conferentes"   element={<Suspense fallback={<ContentLoader />}><Conferentes /></Suspense>} />
            <Route path="empresas"      element={<Suspense fallback={<ContentLoader />}><Empresas /></Suspense>} />
            <Route path="rotas"         element={<Suspense fallback={<ContentLoader />}><Rotas /></Suspense>} />
            <Route path="financeiro"    element={<Suspense fallback={<ContentLoader />}><Financeiro /></Suspense>} />
            <Route path="pagamentos"    element={<Suspense fallback={<ContentLoader />}><Pagamentos /></Suspense>} />
            <Route path="relatorios"    element={<Suspense fallback={<ContentLoader />}><Relatorios /></Suspense>} />
            <Route path="ranking"       element={<Suspense fallback={<ContentLoader />}><Ranking /></Suspense>} />
            <Route path="meus-dados"    element={<Suspense fallback={<ContentLoader />}><Configuracoes /></Suspense>} />
            <Route path="usuarios"      element={<Suspense fallback={<ContentLoader />}><Usuarios /></Suspense>} />
            <Route path="logs"          element={<Suspense fallback={<ContentLoader />}><Logs /></Suspense>} />
            <Route path="entregas"      element={<Suspense fallback={<ContentLoader />}><Entregas /></Suspense>} />
            <Route path="despesas"      element={<Suspense fallback={<ContentLoader />}><Despesas /></Suspense>} />
          </Route>

          {/* Qualquer rota desconhecida → login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
