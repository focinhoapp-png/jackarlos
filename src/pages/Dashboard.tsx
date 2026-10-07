import React, { useState, useEffect } from 'react';
import { Package, DollarSign, Building2, Users, CheckCircle, ShieldCheck, Truck, CalendarDays, BarChart2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { supabase, fetchAllPaginated } from '@/src/lib/supabase';

// ─── Painel do Conferente ─────────────────────────────────────────────────────
interface ConferenteMetrics {
  scannedToday: number;
  scannedWeek: number;
  scannedMonth: number;
  driversLoadedToday: number;
  driversLoadedMonth: number;
  companiesHandledToday: number;
  hourlyData: { time: string; pacotes: number }[];
  driversRankToday: { name: string; count: number }[];
}

function ConferenteDashboard() {
  const [metrics, setMetrics] = useState<ConferenteMetrics>({
    scannedToday: 0,
    scannedWeek: 0,
    scannedMonth: 0,
    driversLoadedToday: 0,
    driversLoadedMonth: 0,
    companiesHandledToday: 0,
    hourlyData: [],
    driversRankToday: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    fetchConferenteData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchConferenteData = async () => {
    const startTime = performance.now();
    console.log('[Dashboard Conferente] Iniciando carregamento...');
    let queriesCount = 0;
    setIsLoading(true);
    queriesCount++;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsLoading(false); return; }

    const now = new Date();
    const startOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfWeek  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    queriesCount++;
    const { data, error } = await supabase.rpc('get_conferente_dashboard_metrics', {
      p_start_of_day: startOfDay,
      p_start_of_week: startOfWeek,
      p_start_of_month: startOfMonth,
      p_user_id: user.id
    });

    if (!error && data) {
      setMetrics(data);
    }

    setIsLoading(false);
    setLastUpdated(new Date());
    const totalTime = performance.now() - startTime;
    console.log(`[Dashboard Conferente] Carregamento concluído em ${totalTime.toFixed(2)}ms. Consultas realizadas: ${queriesCount}`);
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Detalhamento</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            Visão do Conferente
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Sincronizado
          </span>
          · Última atualização: {lastUpdated.toLocaleTimeString('pt-BR')}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pacotes Conferidos Hoje</CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.scannedToday}</div>
            <p className="text-xs text-muted-foreground mt-1">Escaneados por você hoje</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entregadores Carregados Hoje</CardTitle>
            <Truck className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.driversLoadedToday}</div>
            <p className="text-xs text-muted-foreground mt-1">Entregadores distintos hoje</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Empresas Atendidas Hoje</CardTitle>
            <Building2 className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.companiesHandledToday}</div>
            <p className="text-xs text-muted-foreground mt-1">Diferentes empresas conferidas</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pacotes na Semana</CardTitle>
            <CalendarDays className="h-4 w-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.scannedWeek}</div>
            <p className="text-xs text-muted-foreground mt-1">Nos últimos 7 dias</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pacotes no Mês</CardTitle>
            <BarChart2 className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.scannedMonth}</div>
            <p className="text-xs text-muted-foreground mt-1">Total no mês atual</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entregadores no Mês</CardTitle>
            <Users className="h-4 w-4 text-teal-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.driversLoadedMonth}</div>
            <p className="text-xs text-muted-foreground mt-1">Entregadores distintos no mês</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-1 lg:col-span-4 bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Conferências por Hora (Hoje)</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[280px] w-full">
              {metrics.hourlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.hourlyData}>
                    <defs>
                      <linearGradient id="colorConf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px' }} itemStyle={{ color: '#0f172a' }} />
                    <Area type="monotone" dataKey="pacotes" name="Pacotes" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorConf)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem atividade hoje</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1 lg:col-span-3 bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Entregadores Conferidos Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 mt-1">
              {metrics.driversRankToday.length > 0 ? metrics.driversRankToday.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.name}</p>
                    <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                      <div
                        className="bg-primary h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.round((d.count / (metrics.driversRankToday[0]?.count || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-muted-foreground shrink-0">{d.count} pkgs</span>
                </div>
              )) : (
                <div className="text-center text-muted-foreground text-sm py-8">Sem conferências hoje</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Painel do Admin / Entregador ────────────────────────────────────────────
export function Dashboard() {
  const [metrics, setMetrics] = useState({
    todayDeliveries: 0,
    todayValue: 0,
    activeDrivers: 0,
    completedToday: 0,
    weekDeliveries: 0,
    monthDeliveries: 0,
    monthValue: 0,
    companiesCount: 0,
    returnedMonth: 0
  });

  const [companyData, setCompanyData] = useState<any[]>([]);
  const [hourlyData, setHourlyData] = useState<any[]>([]);
  const [topDrivers, setTopDrivers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUserEntregador, setIsUserEntregador] = useState(false);
  const [isUserConferente, setIsUserConferente] = useState(false);

  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    initializeDashboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeDashboard = async () => {
    const startTime = performance.now();
    console.log('[Dashboard Admin] Iniciando carregamento...');
    let queriesCount = 0;
    setIsLoading(true);
    
    // 1. Uma única chamada para Auth e Role
    queriesCount++;
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      setIsLoading(false);
      return;
    }

    queriesCount++;
    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    
    if (userData?.role === 'CONFERENTE') {
      setIsUserConferente(true);
      setIsLoading(false);
      return; // ConferenteDashboard handles its own fetch
    }

    let isEntregador = false;
    let driverId = null;

    if (userData?.role === 'ENTREGADOR') {
      setIsUserEntregador(true);
      isEntregador = true;
      queriesCount++;
      const { data: driverData } = await supabase.from('drivers').select('id').eq('user_id', user.id).single();
      if (driverData) driverId = driverData.id;
    }

    // 2. Fetch Dados do Dashboard Admin/Entregador
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    queriesCount++;
    const { data, error } = await supabase.rpc('get_admin_dashboard_metrics', {
      p_start_of_day: startOfDay,
      p_start_of_week: startOfWeek,
      p_start_of_month: startOfMonth,
      p_driver_id: isEntregador ? driverId : null
    });

    if (!error && data) {
      setMetrics({
        todayDeliveries: data.todayDeliveries,
        todayValue: data.todayValue,
        activeDrivers: data.activeDrivers,
        completedToday: data.completedToday,
        weekDeliveries: data.weekDeliveries,
        monthDeliveries: data.monthDeliveries,
        monthValue: data.monthValue,
        companiesCount: data.companiesCount,
        returnedMonth: data.returnedMonth
      });
      setCompanyData(data.companyData);
      setHourlyData(data.hourlyData);
      setTopDrivers(data.topDrivers);
    }
    setIsLoading(false);
    const totalTime = performance.now() - startTime;
    console.log(`[Dashboard Admin] Carregamento concluído em ${totalTime.toFixed(2)}ms. Consultas realizadas: ${queriesCount}`);
  };

  // Renderiza painel do conferente separado
  if (isUserConferente) return <ConferenteDashboard />;

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando detalhamento...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Detalhamento</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Sincronizado
          </span>
          · Última atualização: {lastUpdated.toLocaleTimeString('pt-BR')}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entregas Hoje</CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.todayDeliveries}</div>
            <p className="text-xs text-muted-foreground">Pacotes carregados hoje</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total Hoje</CardTitle>
            <DollarSign className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {metrics.todayValue.toFixed(2).replace('.', ',')}</div>
            <p className="text-xs text-muted-foreground">Em mercadorias processadas</p>
          </CardContent>
        </Card>

        {!isUserEntregador && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Entregadores Ativos</CardTitle>
              <Users className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.activeDrivers}</div>
              <p className="text-xs text-muted-foreground">Cadastrados no sistema</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entregas Concluídas</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.completedToday}</div>
            <p className="text-xs text-muted-foreground">Finalizadas hoje</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entregas na Semana</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.weekDeliveries}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entregas no Mês</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.monthDeliveries}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total Mês</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {metrics.monthValue.toFixed(2).replace('.', ',')}</div>
          </CardContent>
        </Card>

        {isUserEntregador && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Entregas Devolvidas</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">{metrics.returnedMonth}</div>
              <p className="text-xs text-muted-foreground">Devolvidas no mês</p>
            </CardContent>
          </Card>
        )}

        {!isUserEntregador && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Empresas Atendidas</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.companiesCount}</div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-1 lg:col-span-4">
          <CardHeader>
            <CardTitle>Entregas por Hora Hoje</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] w-full">
              {hourlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hourlyData}>
                    <defs>
                      <linearGradient id="colorEntregas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px' }} itemStyle={{ color: '#0f172a' }} />
                    <Area type="monotone" dataKey="entregas" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorEntregas)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">Sem dados para hoje</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1 lg:col-span-3">
          <CardHeader>
            <CardTitle>Entregas por Empresa Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {companyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={companyData} layout="vertical" margin={{ top: 0, right: 0, left: 50, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={true} vertical={false} />
                    <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px' }} />
                    <Bar dataKey="value" name="entregas" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">Sem dados de empresas</div>
              )}
            </div>
          </CardContent>
        </Card>

        {!isUserEntregador && (
          <Card className="col-span-1 lg:col-span-7">
            <CardHeader>
              <CardTitle>Top Entregadores Geral</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {topDrivers.length > 0 ? topDrivers.map((driver, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium leading-none">{driver.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">{driver.deliveries} entregas carregadas</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <div className="text-sm font-bold text-success">R$ {driver.amount.toFixed(2).replace('.', ',')}</div>
                      <div className="text-[10px] text-success/80">(Valor Gerado)</div>
                    </div>
                  </div>
                )) : (
                  <div className="text-center text-muted-foreground">Sem entregadores ativos com registros</div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
