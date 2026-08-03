import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Building2, Users, Package, Calendar, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '@/src/lib/supabase';

/** Formata Date como YYYY-MM-DD em hora local (evita bug UTC) */
const toLocalISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

export function Financeiro() {
  const hoje = new Date();
  const primeiroDiaMes = toLocalISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const ultimoDiaMes  = toLocalISO(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0));

  const [dateStart, setDateStart] = useState(primeiroDiaMes);
  const [dateEnd, setDateEnd]     = useState(ultimoDiaMes);
  // Valores aplicados (só atualizam ao clicar em Aplicar)
  const [appliedStart, setAppliedStart] = useState(primeiroDiaMes);
  const [appliedEnd,   setAppliedEnd]   = useState(ultimoDiaMes);

  const [metrics, setMetrics] = useState({
    faturamento: 0,
    repasse: 0,
    lucro: 0,
    entregas: 0,
    avgDelivery: 0
  });

  const [companyRevenue, setCompanyRevenue] = useState<any[]>([]);
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchFinanceiroData();
  }, [appliedStart, appliedEnd]);

  const fetchFinanceiroData = async () => {
    setIsLoading(true);

    // Montar intervalo: de appliedStart 00:00:00 até appliedEnd 23:59:59 (hora local)
    const [sy, sm, sd] = appliedStart.split('-').map(Number);
    const [ey, em, ed] = appliedEnd.split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
    const endDate   = new Date(ey, em - 1, ed, 23, 59, 59, 999);
    
    const { data: pkgs, error } = await supabase
      .from('packages')
      .select('id, driver_id, scanned_at, delivery_value_snapshot, driver_bonus_snapshot, companies(name), drivers(name)')
      .gte('scanned_at', startDate.toISOString())
      .lte('scanned_at', endDate.toISOString());

    if (!error && pkgs) {
      let faturamento = 0;
      let repasse = 0;
      let entregas = pkgs.length;
      
      const compRev: Record<string, number> = {};
      const pagtos: Record<string, { driverId: string, driver: string, isoDate: string, displayDate: string, count: number, repasse: number }> = {};

      pkgs.forEach((p: any) => {
        const val = Number(p.delivery_value_snapshot || 0);
        const bon = Number(p.driver_bonus_snapshot || 0);
        
        const valorRepasse = val + bon;

        faturamento += val;
        repasse += valorRepasse;

        if (p.companies?.name) {
          compRev[p.companies.name] = (compRev[p.companies.name] || 0) + val;
        }

        if (p.drivers?.name && p.driver_id) {
          const dName = p.drivers.name;
          const dateObj = new Date(p.scanned_at);
          const isoDate = toLocalISO(dateObj);
          const displayDate = dateObj.toLocaleDateString('pt-BR');
          
          const key = `${p.driver_id}-${isoDate}`;
          
          if (!pagtos[key]) {
            pagtos[key] = { driverId: p.driver_id, driver: dName, isoDate, displayDate, count: 0, repasse: 0 };
          }
          pagtos[key].count++;
          pagtos[key].repasse += valorRepasse;
        }
      });

      setMetrics({
        faturamento,
        repasse,
        lucro: faturamento - repasse,
        entregas,
        avgDelivery: entregas > 0 ? faturamento / entregas : 0
      });

      const colors = ['#0ea5e9', '#84cc16', '#f43f5e', '#8b5cf6', '#14b8a6', '#f59e0b'];
      const cRev = Object.entries(compRev).map(([name, value], i) => ({
        name,
        value,
        color: colors[i % colors.length]
      })).sort((a, b) => b.value - a.value);
      
      setCompanyRevenue(cRev);

      const { data: paymentsData } = await supabase
        .from('driver_payments')
        .select('driver_id, status')
        .gte('period_start', appliedStart)
        .lte('period_end', appliedEnd);

      const paymentMap: Record<string, string> = {};
      if (paymentsData) {
        paymentsData.forEach((pm: any) => {
          paymentMap[pm.driver_id] = pm.status;
        });
      }

      const pDrivers = Object.values(pagtos).map((p) => ({
        id: `${p.driverId}-${p.isoDate}`,
        driverId: p.driverId,
        name: p.driver,
        period: p.displayDate,
        isoDate: p.isoDate,
        count: p.count,
        amount: p.repasse.toFixed(2).replace('.', ','),
        rawAmount: p.repasse,
        status: paymentMap[p.driverId] || 'Pendente'
      })).sort((a, b) => {
        if (a.isoDate !== b.isoDate) return b.isoDate.localeCompare(a.isoDate);
        return b.count - a.count;
      });

      setPagamentos(pDrivers);
    }
    setIsLoading(false);
  };


  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando financeiro...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>

        {/* Filtro de Período por Data */}
        <div className="flex flex-wrap items-end gap-3 bg-card border border-border rounded-xl p-3 shadow-sm">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Data Início
            </label>
            <input
              type="date"
              value={dateStart}
              max={dateEnd}
              onChange={(e) => setDateStart(e.target.value)}
              className="text-sm bg-background border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Data Final
            </label>
            <input
              type="date"
              value={dateEnd}
              min={dateStart}
              onChange={(e) => setDateEnd(e.target.value)}
              className="text-sm bg-background border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            />
          </div>
          <button
            onClick={() => { setAppliedStart(dateStart); setAppliedEnd(dateEnd); }}
            className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Search className="w-3.5 h-3.5" /> Aplicar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento Bruto</CardTitle>
            <DollarSign className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {metrics.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Repasse a Entregadores</CardTitle>
            <Users className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {metrics.repasse.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lucro Operacional</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {metrics.lucro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valor Médio (Faturamento)</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {metrics.avgDelivery.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              Baseado em {metrics.entregas.toLocaleString('pt-BR')} entregas
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-card shadow-sm border-border col-span-1 lg:col-span-2 flex flex-col">
          <CardHeader className="border-b border-border bg-muted/20 pb-4">
            <CardTitle className="text-lg font-bold">Resumo Financeiro (Visão Geral)</CardTitle>
            <CardDescription>Acompanhamento de faturamento e repasses aos entregadores no período.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 flex-1 min-h-[300px] flex items-center justify-center">
            {/* Mantido simples por ser um gráfico genérico sem separar por meses (pois estamos agrupando o total direto) */}
            <div className="flex w-full gap-8 h-full items-end justify-around p-4 border rounded-lg bg-secondary/10">
               <div className="flex flex-col items-center flex-1 max-w-xs group">
                 <div className="w-full bg-blue-500 rounded-t-md transition-all duration-500 hover:opacity-80 relative flex items-end justify-center" style={{ height: metrics.faturamento > 0 ? '200px' : '0px' }}>
                   <span className="mb-2 text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity">R$ {metrics.faturamento.toFixed(0)}</span>
                 </div>
                 <span className="mt-4 font-medium text-sm">Faturamento</span>
               </div>
               <div className="flex flex-col items-center flex-1 max-w-xs group">
                 <div className="w-full bg-slate-500 rounded-t-md transition-all duration-500 hover:opacity-80 relative flex items-end justify-center" style={{ height: (metrics.faturamento > 0 ? (metrics.repasse / metrics.faturamento) * 200 : 0) + 'px' }}>
                   <span className="mb-2 text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity">R$ {metrics.repasse.toFixed(0)}</span>
                 </div>
                 <span className="mt-4 font-medium text-sm">Repasse</span>
               </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border-border flex flex-col">
          <CardHeader className="border-b border-border bg-muted/20 pb-4">
            <CardTitle className="text-lg font-bold">Faturamento por Empresa</CardTitle>
            <CardDescription>Distribuição de receita no período.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 flex flex-col justify-center items-center flex-1">
            <div className="h-[200px] w-full">
              {companyRevenue.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={companyRevenue}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {companyRevenue.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px' }}
                      formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Faturamento']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados de empresas</div>
              )}
            </div>
            
            <div className="w-full space-y-3 mt-4">
              {companyRevenue.map((emp) => (
                <div key={emp.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: emp.color }}></div>
                    <span className="text-sm font-medium">{emp.name}</span>
                  </div>
                  <span className="text-sm font-bold">R$ {emp.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card shadow-sm border-border">
        <CardHeader className="border-b border-border bg-muted/20 pb-4 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Pagamentos Entregadores (Resumo do Período)
            </CardTitle>
            <CardDescription>Valores totais gerados pelos entregadores no período selecionado.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="overflow-x-auto w-full"><table className="w-full text-sm text-left min-w-[800px]">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/10 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">Entregador</th>
                  <th className="px-6 py-4 font-medium">Data (Dia Trabalhado)</th>
                  <th className="px-6 py-4 font-medium">Total de Entregas</th>
                  <th className="px-6 py-4 font-medium text-right">Repasse Estimado</th>
                  <th className="px-6 py-4 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {pagamentos.length > 0 ? pagamentos.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                    <td className="px-6 py-4 font-bold text-foreground">{row.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{row.period}</td>
                    <td className="px-6 py-4 font-medium">{row.count} entregas</td>
                    <td className="px-6 py-4 text-right font-bold text-success">R$ {row.amount}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                        row.status === 'Pago'
                          ? 'bg-success/20 text-success'
                          : 'bg-yellow-500/20 text-yellow-700'
                      }`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum dado encontrado no período.</td>
                  </tr>
                )}
              </tbody>
            </table></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
