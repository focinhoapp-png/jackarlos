/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/Login';
import { AdminLayout } from './layouts/AdminLayout';
import { Dashboard } from './pages/Dashboard';
import { ScannerPanel } from './pages/ScannerPanel';
import { History } from './pages/History';
import { TVPanel } from './pages/TVPanel';
import { DriverPanel } from './pages/DriverPanel';
import { Entregadores } from './pages/Entregadores';
import { Conferentes } from './pages/Conferentes';
import { Empresas } from './pages/Empresas';
import { Financeiro } from './pages/Financeiro';
import { Relatorios } from './pages/Relatorios';
import { Pagamentos } from './pages/Pagamentos';
import { Ranking } from './pages/Ranking';
import { Configuracoes } from './pages/Configuracoes';
import { Usuarios } from './pages/Usuarios';
import { Estoque } from './pages/Estoque';
import { Rotas } from './pages/Rotas';
import { Logs } from './pages/Logs';
import { Entregas } from './pages/Entregas';
import { Despesas } from './pages/Despesas';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        <Route path="/admin/tv" element={<TVPanel />} />
        
        <Route path="/driver/dashboard" element={<div className="bg-background min-h-screen text-foreground p-4"><DriverPanel /></div>} />
        
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/detalhamento" replace />} />
          {/* Aliases para compatibilidade com links antigos */}
          <Route path="dashboard" element={<Navigate to="/admin/detalhamento" replace />} />
          <Route path="scanner" element={<Navigate to="/admin/carregamentos" replace />} />
          <Route path="history" element={<Navigate to="/admin/historico" replace />} />
          <Route path="config" element={<Navigate to="/admin/meus-dados" replace />} />
          {/* Rotas principais */}
          <Route path="detalhamento" element={<Dashboard />} />
          <Route path="carregamentos" element={<ScannerPanel />} />
          <Route path="historico" element={<History />} />
          <Route path="entregadores" element={<Entregadores />} />
          <Route path="estoque" element={<Estoque />} />
          <Route path="conferentes" element={<Conferentes />} />
          <Route path="empresas" element={<Empresas />} />
          <Route path="rotas" element={<Rotas />} />
          <Route path="financeiro" element={<Financeiro />} />
          <Route path="pagamentos" element={<Pagamentos />} />
          <Route path="relatorios" element={<Relatorios />} />
          <Route path="ranking" element={<Ranking />} />
          <Route path="meus-dados" element={<Configuracoes />} />
          <Route path="usuarios" element={<Usuarios />} />
          <Route path="logs" element={<Logs />} />
          <Route path="entregas" element={<Entregas />} />
          <Route path="despesas" element={<Despesas />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
