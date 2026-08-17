import React, { useState, useEffect } from 'react';
import { BarChart3, FileText, Download, FileSpreadsheet, Calendar, Filter, Search, Package, DollarSign, Building2, Users, MessageCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Label } from '@/src/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Input } from '@/src/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/src/components/ui/dialog';
import { supabase, fetchAllPaginated } from '@/src/lib/supabase';

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
}

export function Relatorios() {
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [filterBase, setFilterBase] = useState('todas');
  const [filterCompany, setFilterCompany] = useState('todas');
  const [filterDriver, setFilterDriver] = useState('todos');
  
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const [displayedResults, setDisplayedResults] = useState<DeliveryRecord[]>([]);
  const [allDrivers, setAllDrivers] = useState<{ id: string; name: string }[]>([]);
  const [allCompanies, setAllCompanies] = useState<string[]>([]);
  const [isEntregador, setIsEntregador] = useState(false);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [filterDriverId, setFilterDriverId] = useState<string | null>(null);
  const [isCheckingRole, setIsCheckingRole] = useState(true);

  useEffect(() => {
    supabase.from('drivers').select('id, name').order('name').then(res => {
      if (res.data) setAllDrivers(res.data.map(d => ({ id: d.id, name: d.name })));
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

    // Ajuste de fuso: usamos início e fim do dia em horário local convertido para ISO
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59`);
    
    const queryFactory = async () => {
      let query = supabase
        .from('packages')
        .select('id, scanned_at, status, delivery_value_snapshot, driver_bonus_snapshot, base_location, companies(name), drivers(name, id)')
        .gte('scanned_at', start.toISOString())
        .lte('scanned_at', end.toISOString());
        
      if (filterBase !== 'todas') {
        query = query.eq('base_location', filterBase);
      }

      // Filtra por driver_id diretamente na query (igual ao Estoque)
      const effectiveDriverId = isEntregador ? driverId : filterDriverId;
      if (effectiveDriverId) {
        query = query.eq('driver_id', effectiveDriverId);
      }

      if (filterCompany !== 'todas') {
        const companyData = await supabase.from('companies').select('id').eq('name', filterCompany).single();
        if (companyData.data?.id) {
          query = query.eq('company_id', companyData.data.id);
        }
      }
      return query;
    };
    
    // We need to unwrap the async factory, but fetchAllPaginated takes a sync factory.
    // Wait, we can just resolve the company data beforehand!
    let compId = null;
    if (filterCompany !== 'todas') {
      const companyData = await supabase.from('companies').select('id').eq('name', filterCompany).single();
      compId = companyData.data?.id;
    }

    const finalQueryFactory = () => {
      let query = supabase
        .from('packages')
        .select('id, scanned_at, status, delivery_value_snapshot, driver_bonus_snapshot, base_location, companies(name), drivers(name, id)')
        .gte('scanned_at', start.toISOString())
        .lte('scanned_at', end.toISOString());
        
      if (filterBase !== 'todas') query = query.eq('base_location', filterBase);
      const effectiveDriverId = isEntregador ? driverId : filterDriverId;
      if (effectiveDriverId) query = query.eq('driver_id', effectiveDriverId);
      if (compId) query = query.eq('company_id', compId);
      
      return query;
    };

    const { data, error } = await fetchAllPaginated(finalQueryFactory);

    if (!error && data) {
      const mapped = data.map((p: any) => ({
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

      setDisplayedResults(mapped);
      setShowResults(true);
    } else {
      console.error(error);
      alert('Erro ao buscar dados.');
    }
    
    setIsSearching(false);
  };

  const totalDeliveries = displayedResults.length;
  const totalConcluidas = displayedResults.filter(r => r.status === 'ENTREGUE').length;
  const totalDevolvidas = displayedResults.filter(r => r.status === 'DEVOLVIDA').length;
  const totalValue = displayedResults.reduce((sum, item) => sum + item.value + item.bonus, 0);
  
  const driversCount = displayedResults.reduce((acc, curr) => {
    acc[curr.driver] = (acc[curr.driver] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const companyValue = displayedResults.reduce((acc, curr) => {
    acc[curr.company] = (acc[curr.company] || 0) + curr.value + curr.bonus;
    return acc;
  }, {} as Record<string, number>);

  const companyCount = displayedResults.reduce((acc, curr) => {
    acc[curr.company] = (acc[curr.company] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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

  const handleExport = (action: 'download' | 'whatsapp') => {
    if (displayedResults.length === 0) {
      alert('Nenhum dado para exportar.');
      return;
    }
    
    if (action === 'download') {
      if (exportType === 'excel') {
        const csvContent = generateCSV(displayedResults);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'relatorio_entregas.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        window.print();
      }
    } else {
      const title = exportType === 'excel' ? 'Planilha' : 'PDF';
      const text = `*Relatório de Entregas (${title})*\n\n*Total de Entregas:* ${totalDeliveries}\n*Concluídas:* ${totalConcluidas}\n*Devolvidas:* ${totalDevolvidas}\n*Faturamento Total:* R$ ${totalValue.toFixed(2).replace('.', ',')}\n\n(Gerado via Painel Jackarlos)`;
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
                  <Select value={filterBase} onValueChange={setFilterBase} disabled={isEntregador || isCheckingRole}>
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
                    {allDrivers.map(d => (
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
                    <Button type="button" variant="outline" className="gap-2 bg-background hover:bg-success hover:text-success-foreground hover:border-success transition-colors" onClick={() => setExportType('excel')} disabled={displayedResults.length === 0}>
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

      {showResults && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card className="bg-card">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Entregas</p>
                    <p className="font-bold text-xl">{totalDeliveries}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Concluídas</p>
                    <p className="font-bold text-xl text-success">{totalConcluidas}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Devolvidas</p>
                    <p className="font-bold text-xl text-destructive">{totalDevolvidas}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Valor Total</p>
                    <p className="font-bold text-xl">R$ {totalValue.toFixed(2).replace('.', ',')}</p>
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
                      {Object.entries(companyValue).map(([emp, val]: [string, any]) => (
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
                      {Object.entries(companyCount).map(([emp, count]) => (
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
          </div>

          <Card className="bg-card shadow-sm border-border">
            <CardHeader className="border-b border-border bg-muted/20 pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Detalhamento
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
                    {displayedResults.map((item, index) => (
                      <tr key={index} className="border-b border-border hover:bg-muted/20 transition-colors">
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
                  </tbody>
                </table></div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
