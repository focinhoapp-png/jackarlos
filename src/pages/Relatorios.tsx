import React, { useState, useEffect } from 'react';
import { BarChart3, FileText, Download, FileSpreadsheet, Calendar, Filter, Search, Package, DollarSign, Building2, Users, MessageCircle, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Label } from '@/src/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Input } from '@/src/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/src/components/ui/dialog';
import { supabase, fetchStreamingPaginated } from '@/src/lib/supabase';

interface DeliveryRecord {
  id: string;
  driver: string;
  company: string;
  date: string;
  time: string;
  value: number;
  bonus: number;
  base: string;
  status: string;
  scanned_at?: string;
}

export function Relatorios() {
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [filterBase, setFilterBase] = useState('todas');
  const [filterCompany, setFilterCompany] = useState('todas');
  const [filterDriver, setFilterDriver] = useState('todos');
  
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Novos Estados (Arquitetura Otimizada V2)
  const [metrics, setMetrics] = useState<{
    totalDeliveries: number;
    totalConcluidas: number;
    totalDevolvidas: number;
    totalValue: number;
    companyValue: Record<string, number>;
    companyCount: Record<string, number>;
    uniqueDates: string[];
  } | null>(null);

  const [tableData, setTableData] = useState<DeliveryRecord[]>([]);
  const [lastCursor, setLastCursor] = useState<{ scannedAt: string, id: string } | null>(null);
  const [hasMoreTableData, setHasMoreTableData] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const [selectedDateDetails, setSelectedDateDetails] = useState<string | null>(null);
  const [modalData, setModalData] = useState<DeliveryRecord[]>([]);
  const [isLoadingModal, setIsLoadingModal] = useState(false);

  const [allDrivers, setAllDrivers] = useState<{ id: string; name: string; base_location?: string | null }[]>([]);
  const [allCompanies, setAllCompanies] = useState<string[]>([]);
  const [isEntregador, setIsEntregador] = useState(false);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [filterDriverId, setFilterDriverId] = useState<string | null>(null);
  const [isCheckingRole, setIsCheckingRole] = useState(true);

  useEffect(() => {
    supabase.from('drivers').select('id, name, base_location').order('name').then(res => {
      if (res.data) setAllDrivers(res.data.map(d => ({ id: d.id, name: d.name, base_location: d.base_location })));
    });
    supabase.from('companies').select('name').then(res => {
      if (res.data) setAllCompanies(res.data.map(c => c.name));
    });

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
        if (userData?.role === 'ENTREGADOR') {
          setIsEntregador(true);
          const { data: driverData } = await supabase.from('drivers').select('id, name, base_location').eq('user_id', user.id).single();
          if (driverData) {
            setDriverId(driverData.id);
            setFilterDriverId(driverData.id);
            setFilterDriver(driverData.name);
            if (driverData.base_location) {
              setFilterBase(driverData.base_location);
            }
          }
        }
      }
      setIsCheckingRole(false);
    });
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearching(true);
    setMetrics(null);
    setTableData([]);
    setLastCursor(null);
    setHasMoreTableData(true);
    setShowResults(false);

    let compId = null;
    if (filterCompany !== 'todas') {
      const companyData = await supabase.from('companies').select('id').eq('name', filterCompany).single();
      compId = companyData.data?.id;
    }

    const effectiveDriverId = isEntregador ? driverId : filterDriverId;

    // 1. Busca Métricas pela RPC
    const startTime = performance.now();
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_relatorios_metrics', {
      p_start: startDate,
      p_end: endDate,
      p_base: filterBase === 'todas' ? null : filterBase,
      p_company_id: compId,
      p_driver_id: effectiveDriverId
    });

    if (rpcError) {
      console.error(rpcError);
      alert('Erro ao buscar métricas gerais.');
      setIsSearching(false);
      return;
    }

    // Processa retorno da RPC
    const cValue: Record<string, number> = {};
    const cCount: Record<string, number> = {};
    (rpcData.empresas || []).forEach((emp: any) => {
      cValue[emp.name] = Number(emp.value);
      cCount[emp.name] = Number(emp.count);
    });

    setMetrics({
      totalDeliveries: Number(rpcData.totalDeliveries || 0),
      totalConcluidas: Number(rpcData.totalConcluidas || 0),
      totalDevolvidas: Number(rpcData.totalDevolvidas || 0),
      totalValue: Number(rpcData.totalValue || 0),
      companyValue: cValue,
      companyCount: cCount,
      uniqueDates: rpcData.uniqueDates || []
    });

    console.log(`[Performance] Métricas carregadas em ${(performance.now() - startTime).toFixed(2)}ms`);

    // 2. Busca Tabela Inicial
    await loadTablePage(null, null, compId, effectiveDriverId);

    setShowResults(true);
    setIsSearching(false);
  };

  const loadTablePage = async (scannedAtCursor: string | null = null, idCursor: string | null = null, forceCompId: string | null = null, forceDrvId: string | null = null) => {
    setIsLoadingMore(true);
    
    const [y1, m1, d1] = startDate.split('-');
    const dStart = new Date(Number(y1), Number(m1)-1, Number(d1), 0, 0, 0);
    const [y2, m2, d2] = endDate.split('-');
    const dEnd = new Date(Number(y2), Number(m2)-1, Number(d2), 0, 0, 0);
    dEnd.setDate(dEnd.getDate() + 1);

    let query = supabase
      .from('packages')
      .select('id, scanned_at, status, delivery_value_snapshot, driver_bonus_snapshot, base_location, companies(name), drivers(name, id)')
      .gte('scanned_at', dStart.toISOString())
      .lt('scanned_at', dEnd.toISOString())
      .neq('status', 'EM_ROTA');
      
    if (filterBase !== 'todas') query = query.eq('base_location', filterBase);
    
    const compId = forceCompId !== null ? forceCompId : (filterCompany !== 'todas' ? (await supabase.from('companies').select('id').eq('name', filterCompany).single()).data?.id : null);
    if (compId) query = query.eq('company_id', compId);
    
    const drvId = forceDrvId !== null ? forceDrvId : (isEntregador ? driverId : filterDriverId);
    if (drvId) query = query.eq('driver_id', drvId);

    if (scannedAtCursor && idCursor) {
      query = query.or(`scanned_at.lt.${scannedAtCursor},and(scanned_at.eq.${scannedAtCursor},id.lt.${idCursor})`);
    }

    const { data, error } = await query
      .order('scanned_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(50);

    if (error) {
      console.error(error);
      setIsLoadingMore(false);
      return;
    }

    if (data.length < 50) setHasMoreTableData(false);

    if (data.length > 0) {
      const last = data[data.length - 1];
      setLastCursor({ scannedAt: last.scanned_at, id: last.id });
      
      const mapped = data.map((p: any) => ({
        id: p.id,
        driver: p.drivers?.name || 'Desconhecido',
        company: p.companies?.name || 'Desconhecida',
        date: new Date(p.scanned_at).toLocaleDateString(),
        time: new Date(p.scanned_at).toLocaleTimeString(),
        value: Number(p.delivery_value_snapshot || 0),
        bonus: Number(p.driver_bonus_snapshot || 0),
        base: p.base_location || 'Guapimirim',
        status: p.status,
        scanned_at: p.scanned_at
      }));

      if (!scannedAtCursor) setTableData(mapped);
      else setTableData(prev => [...prev, ...mapped]);
    } else {
      if (!scannedAtCursor) setTableData([]);
    }
    
    setIsLoadingMore(false);
  };

  // Carrega modal sob demanda para não pesar
  useEffect(() => {
    if (!selectedDateDetails) return;
    setIsLoadingModal(true);
    setModalData([]);
    
    const [d, m, y] = selectedDateDetails.split('/');
    const dStart = new Date(Number(y), Number(m)-1, Number(d), 0, 0, 0);
    const dEnd = new Date(Number(y), Number(m)-1, Number(d), 0, 0, 0);
    dEnd.setDate(dEnd.getDate() + 1);

    const runModal = async () => {
      let query = supabase
        .from('packages')
        .select('id, scanned_at, status, delivery_value_snapshot, driver_bonus_snapshot, base_location, companies(name), drivers(name, id)')
        .gte('scanned_at', dStart.toISOString())
        .lt('scanned_at', dEnd.toISOString())
        .neq('status', 'EM_ROTA');
        
      if (filterBase !== 'todas') query = query.eq('base_location', filterBase);
      const effectiveDriverId = isEntregador ? driverId : filterDriverId;
      if (effectiveDriverId) query = query.eq('driver_id', effectiveDriverId);
      
      if (filterCompany !== 'todas') {
         const { data: cData } = await supabase.from('companies').select('id').eq('name', filterCompany).single();
         if (cData?.id) query = query.eq('company_id', cData.id);
      }
      
      const { data } = await query.order('scanned_at', { ascending: false }).limit(2000);
      if (data) {
        setModalData(data.map((p: any) => ({
          id: p.id,
          driver: p.drivers?.name || 'Desconhecido',
          company: p.companies?.name || 'Desconhecida',
          date: new Date(p.scanned_at).toLocaleDateString(),
          time: new Date(p.scanned_at).toLocaleTimeString(),
          value: Number(p.delivery_value_snapshot || 0),
          bonus: Number(p.driver_bonus_snapshot || 0),
          base: p.base_location || 'Guapimirim',
          status: p.status
        })));
      }
      setIsLoadingModal(false);
    };
    runModal();
  }, [selectedDateDetails]);

  const [exportType, setExportType] = useState<'excel' | 'pdf' | null>(null);

  const generateCSV = (data: DeliveryRecord[]) => {
    const headers = ['Data', 'Hora', 'Entregador', 'Empresa', 'Base', 'Bonus', 'Valor'];
    const rows = data.map(item => [
      item.date, 
      item.time, 
      `"${item.driver}"`, 
      `"${item.company}"`, 
      item.base, 
      item.bonus.toFixed(2), 
      item.value.toFixed(2)
    ]);
    return [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  };

  const handleExport = async (action: 'download' | 'whatsapp') => {
    if (!metrics || metrics.totalDeliveries === 0) {
      alert('Nenhum dado para exportar no período filtrado.');
      return;
    }
    
    if (action === 'download' && exportType === 'excel') {
      alert("Preparando o arquivo completo com todas as " + metrics.totalDeliveries + " entregas. Aguarde um momento...");
      
      let compId = null;
      if (filterCompany !== 'todas') {
        const companyData = await supabase.from('companies').select('id').eq('name', filterCompany).single();
        compId = companyData.data?.id;
      }

      const [y1, m1, d1] = startDate.split('-');
      const dStart = new Date(Number(y1), Number(m1)-1, Number(d1), 0, 0, 0);
      const [y2, m2, d2] = endDate.split('-');
      const dEnd = new Date(Number(y2), Number(m2)-1, Number(d2), 0, 0, 0);
      dEnd.setDate(dEnd.getDate() + 1);

      const finalQueryFactory = () => {
        let query = supabase
          .from('packages')
          .select('id, scanned_at, status, delivery_value_snapshot, driver_bonus_snapshot, base_location, companies(name), drivers(name, id)')
          .gte('scanned_at', dStart.toISOString())
          .lt('scanned_at', dEnd.toISOString())
          .neq('status', 'EM_ROTA');
          
        if (filterBase !== 'todas') query = query.eq('base_location', filterBase);
        const effectiveDriverId = isEntregador ? driverId : filterDriverId;
        if (effectiveDriverId) query = query.eq('driver_id', effectiveDriverId);
        if (compId) query = query.eq('company_id', compId);
        
        return query;
      };

      const allData: DeliveryRecord[] = [];
      await fetchStreamingPaginated(finalQueryFactory, (chunkData) => {
        const mapped = chunkData.map((p: any) => ({
          id: p.id,
          driver: p.drivers?.name || 'Desconhecido',
          company: p.companies?.name || 'Desconhecida',
          date: new Date(p.scanned_at).toLocaleDateString(),
          time: new Date(p.scanned_at).toLocaleTimeString(),
          value: Number(p.delivery_value_snapshot || 0),
          bonus: Number(p.driver_bonus_snapshot || 0),
          base: p.base_location || 'Guapimirim',
          status: p.status
        }));
        allData.push(...mapped);
      });

      const csvContent = generateCSV(allData);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'relatorio_entregas_completo.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } else if (action === 'download' && exportType === 'pdf') {
      window.print();
    } else {
      const title = exportType === 'excel' ? 'Planilha' : 'PDF';
      const text = `*Relatório de Entregas (${title})*\n\n*Total de Entregas:* ${metrics.totalDeliveries}\n*Concluídas:* ${metrics.totalConcluidas}\n*Devolvidas:* ${metrics.totalDevolvidas}\n*Faturamento Total:* R$ ${metrics.totalValue.toFixed(2).replace('.', ',')}\n\n(Gerado via Painel Jackarlos)`;
      const encoded = encodeURIComponent(text);
      window.open(`https://wa.me/?text=${encoded}`, '_blank');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Relatórios Gerenciais</h1>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="border-b border-border bg-muted/20">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              Configurar Relatório
            </CardTitle>
            <CardDescription>
              Selecione os parâmetros para buscar os dados diretamente do banco.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSearch} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Data Inicial</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="date" className="pl-9 bg-background text-foreground" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Data Final</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="date" className="pl-9 bg-background text-foreground" value={endDate} onChange={e => setEndDate(e.target.value)} required />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>Filtrar por Base</Label>
                  <Select 
                    value={filterBase} 
                    onValueChange={(val) => {
                      setFilterBase(val);
                      setFilterDriver('todos');
                      setFilterDriverId(null);
                    }} 
                    disabled={isEntregador || isCheckingRole}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={isCheckingRole ? "Carregando..." : "Todas as bases"} />
                    </SelectTrigger>
                    <SelectContent>
                      {!isEntregador && <SelectItem value="todas">Todas as bases</SelectItem>}
                      <SelectItem value="Guapimirim">Guapimirim</SelectItem>
                      <SelectItem value="Teresópolis">Teresópolis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Filtrar por Empresa</Label>
                  <Select value={filterCompany} onValueChange={setFilterCompany}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Todas as empresas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as empresas</SelectItem>
                      {allCompanies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                <Label>Entregador</Label>
                <Select
                  value={filterDriver}
                  onValueChange={(name) => {
                    setFilterDriver(name);
                    if (name === 'todos') {
                      setFilterDriverId(null);
                    } else {
                      const found = allDrivers.find(d => d.name === name);
                      setFilterDriverId(found?.id ?? null);
                    }
                  }}
                  disabled={isEntregador || isCheckingRole}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder={isCheckingRole ? "Carregando..." : "Selecione..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {!isEntregador && <SelectItem value="todos">Todos os Entregadores</SelectItem>}
                    {allDrivers
                      .filter(d => filterBase === 'todas' || d.base_location === filterBase)
                      .map(d => (
                      <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              </div>

              <div className="pt-4 border-t border-border flex flex-wrap gap-3">
                <Button type="submit" className="gap-2 shadow-lg shadow-primary/20 bg-primary" disabled={isSearching}>
                  {isSearching ? <Search className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {isSearching ? 'Buscando...' : 'Buscar Dados'}
                </Button>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button type="button" variant="outline" className="gap-2 bg-background hover:bg-success hover:text-success-foreground hover:border-success transition-colors" onClick={() => setExportType('excel')} disabled={!metrics || metrics.totalDeliveries === 0}>
                      <FileSpreadsheet className="h-4 w-4" />
                      Exportar Excel
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Opções de Exportação (Excel)</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <Button onClick={() => handleExport('download')} className="w-full gap-2">
                        <Download className="h-4 w-4"/> Baixar Arquivo CSV
                      </Button>
                      <Button onClick={() => handleExport('whatsapp')} variant="outline" className="w-full gap-2 text-success hover:text-success hover:bg-success/10 border-success">
                        <MessageCircle className="h-4 w-4"/> Enviar por WhatsApp
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {showResults && metrics && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card className="bg-card">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Entregas</p>
                    <p className="font-bold text-xl">{metrics.totalDeliveries}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Concluídas</p>
                    <p className="font-bold text-xl text-success">{metrics.totalConcluidas}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Devolvidas</p>
                    <p className="font-bold text-xl text-destructive">{metrics.totalDevolvidas}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Valor Total</p>
                    <p className="font-bold text-xl">R$ {metrics.totalValue.toFixed(2).replace('.', ',')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1 overflow-hidden">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">Valor por Empresa</p>
                    <div className="flex flex-wrap gap-2 text-xs font-bold mt-1">
                      {Object.entries(metrics.companyValue).map(([emp, val]: [string, any]) => (
                        <span key={emp}>{emp.substring(0,3)}: R${val.toFixed(0)}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1 overflow-hidden">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">Qtd. por Empresa</p>
                    <div className="flex flex-wrap gap-2 text-xs font-bold mt-1">
                      {Object.entries(metrics.companyCount).map(([emp, count]) => (
                        <span key={emp} className="inline-flex items-center gap-1">
                          <span className="text-muted-foreground">{emp.substring(0, 3)}:</span>
                          <span>{count} un</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1 overflow-hidden">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">Dias Carregados</p>
                    <div className="flex items-end gap-2 mt-1">
                      <p className="font-bold text-xl">{metrics.uniqueDates.length}</p>
                      <span className="text-xs text-muted-foreground mb-1">viagem(ns)</span>
                    </div>
                    {metrics.uniqueDates.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2 max-h-16 overflow-y-auto pr-1">
                        {metrics.uniqueDates.map(d => (
                           <span 
                             key={d} 
                             onClick={() => setSelectedDateDetails(d)}
                             className="text-[10px] bg-muted/50 px-1.5 py-0.5 rounded text-muted-foreground border border-border cursor-pointer hover:bg-primary/20 hover:text-primary transition-colors"
                             title="Ver detalhes do dia"
                           >
                             {d.substring(0, 5)}
                           </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card shadow-sm border-border">
            <CardHeader className="border-b border-border bg-muted/20 pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Detalhamento (Exibindo página atual)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <div className="overflow-x-auto w-full"><table className="w-full text-sm text-left min-w-[800px]">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-b border-border">
                    <tr>
                      <th className="px-6 py-4 font-medium">Data / Hora</th>
                      <th className="px-6 py-4 font-medium">Entregador</th>
                      <th className="px-6 py-4 font-medium">Empresa</th>
                      <th className="px-6 py-4 font-medium">Base</th>
                      <th className="px-6 py-4 font-medium text-right">Bônus</th>
                      <th className="px-6 py-4 font-medium text-right">Valor Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((item, index) => (
                      <tr key={item.id + index} className="border-b border-border hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-4 text-foreground">
                          <div className="font-medium">{item.date}</div>
                          <div className="text-xs text-muted-foreground">{item.time}</div>
                        </td>
                        <td className="px-6 py-4 font-bold text-foreground">{item.driver}</td>
                        <td className="px-6 py-4 text-muted-foreground">{item.company}</td>
                        <td className="px-6 py-4 text-foreground font-medium">{item.base || 'Guapimirim'}</td>
                        <td className="px-6 py-4 text-right text-muted-foreground">
                          {item.bonus > 0 ? `+ R$ ${item.bonus.toFixed(2).replace('.', ',')}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-success">R$ {(item.value + item.bonus).toFixed(2).replace('.', ',')}</td>
                      </tr>
                    ))}
                    {tableData.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-6 text-muted-foreground">Nenhuma entrega no período.</td>
                      </tr>
                    )}
                  </tbody>
                </table></div>
              </div>
              
              {hasMoreTableData && tableData.length >= 50 && (
                <div className="p-4 border-t border-border flex justify-center bg-muted/10">
                  <Button 
                    variant="outline" 
                    onClick={() => loadTablePage(lastCursor?.scannedAt, lastCursor?.id)}
                    disabled={isLoadingMore}
                    className="gap-2"
                  >
                    {isLoadingMore ? 'Carregando...' : 'Carregar próxima página (50 registros)'}
                    {!isLoadingMore && <ChevronRight className="w-4 h-4" />}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal de Detalhes do Dia */}
      <Dialog open={!!selectedDateDetails} onOpenChange={(open) => !open && setSelectedDateDetails(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Entregas do dia {selectedDateDetails} 
              {isLoadingModal && <span className="ml-2 text-sm text-primary">Carregando...</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto flex-1 mt-4 border border-border rounded-md">
            <table className="w-full text-sm text-left min-w-[600px]">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-b border-border sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 font-medium">Hora</th>
                  <th className="px-4 py-3 font-medium">Entregador</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Base</th>
                  <th className="px-4 py-3 font-medium text-right">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                {modalData.map((item, index) => (
                  <tr key={item.id + index} className="border-b border-border hover:bg-muted/20">
                    <td className="px-4 py-3 text-muted-foreground">{item.time}</td>
                    <td className="px-4 py-3 font-bold text-foreground">{item.driver}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.company}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{item.base || 'Guapimirim'}</td>
                    <td className="px-4 py-3 text-right font-bold text-success">R$ {(item.value + item.bonus).toFixed(2).replace('.', ',')}</td>
                  </tr>
                ))}
                {!isLoadingModal && modalData.length === 0 && (
                  <tr><td colSpan={5} className="p-4 text-center">Nenhuma entrega ou erro ao carregar.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
