import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DollarSign, ChevronLeft, ChevronRight, CheckCircle2, Clock, Eye, Package, Building2, Calendar, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { supabase, fetchAllPaginated } from '@/src/lib/supabase';
import { Button } from '@/src/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import { logAction } from '@/src/lib/audit';

export function Pagamentos() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [atrasados, setAtrasados] = useState<{ month: string; drivers: string[] }[]>([]);

  // Detalhamento (carregamento sob demanda)
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Ref para scroll até a seção "Já Pagos"
  const pagosSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchPagamentos();
    fetchAtrasados(controller.signal);
    return () => controller.abort();
  }, [currentDate]);

  const prevMonth = () => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      return d;
    });
  };

  const nextMonth = () => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      return d;
    });
  };

  const getMonthName = (date: Date) => {
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
  };

  /** Formata data como YYYY-MM-DD usando hora LOCAL (evita bug de fuso horário UTC-3) */
  const localDateStr = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  /**
   * RPC: get_late_payment_summary
   * Toda a lógica de GROUP BY / DISTINCT é feita no banco.
   * Retorna apenas os drivers PENDENTES de cada mês passado.
   */
  const fetchAtrasados = async (signal?: AbortSignal) => {
    try {
      const hoje = new Date();
      const seisM    = new Date(hoje.getFullYear(), hoje.getMonth() - 6, 1);
      const mesAtualStart = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

      const t0 = performance.now();

      const { data, error } = await supabase.rpc('get_late_payment_summary', {
        p_start: localDateStr(seisM),
        p_end:   localDateStr(mesAtualStart)
      });

      const rpcMs = (performance.now() - t0).toFixed(0);
      console.info(`[Pagamentos] RPC get_late_payment_summary: ${rpcMs}ms`);

      if (signal?.aborted) return;
      if (error) { console.error('get_late_payment_summary error:', error); return; }

      if (!data || data.length === 0) { setAtrasados([]); return; }

      // Agrupar por month_key no front (apenas agrupamento, sem cálculo)
      const byMonth: Record<string, { label: string; drivers: string[] }> = {};
      data.forEach((row: { month_key: string; driver_name: string }) => {
        const [year, month] = row.month_key.split('-').map(Number);
        const label = new Date(year, month - 1, 1)
          .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        if (!byMonth[row.month_key]) byMonth[row.month_key] = { label, drivers: [] };
        byMonth[row.month_key].drivers.push(row.driver_name);
      });

      const result = Object.entries(byMonth)
        .sort(([a], [b]) => b.localeCompare(a)) // mais recente primeiro
        .map(([, { label, drivers }]) => ({ month: label, drivers }));

      if (!signal?.aborted) setAtrasados(result);
    } catch (err) {
      if (!signal?.aborted) console.error('Erro ao buscar pagamentos atrasados:', err);
    }
  };

  const fetchPagamentos = async () => {
    setIsLoading(true);
    const t0Total = performance.now();
    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth   = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
      const isoStart = localDateStr(startOfMonth);
      const isoEnd   = localDateStr(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));

      // -------------------------------------------------------------------
      // RPC: get_driver_payment_summary
      // O banco faz COUNT + SUM GROUP BY driver — retorna 1 linha por driver.
      // Em paralelo, busca o status de pagamento do mês.
      // -------------------------------------------------------------------
      const t0Rpc = performance.now();

      const [summaryRes, paymentsRes] = await Promise.all([
        supabase.rpc('get_driver_payment_summary', {
          p_start: startOfMonth.toISOString(),
          p_end:   endOfMonth.toISOString()
        }),
        supabase
          .from('driver_payments')
          .select('driver_id, status')
          .eq('period_start', isoStart)
          .eq('period_end', isoEnd)
      ]);

      const rpcMs = (performance.now() - t0Rpc).toFixed(0);
      console.info(`[Pagamentos] RPC get_driver_payment_summary: ${rpcMs}ms`);

      if (summaryRes.error) throw summaryRes.error;

      const rows = summaryRes.data || [];

      // Mapa de status de pagamento
      const paymentMap: Record<string, string> = {};
      if (!paymentsRes.error && paymentsRes.data) {
        paymentsRes.data.forEach((p: any) => { paymentMap[p.driver_id] = p.status; });
      }

      // Montar lista final — sem loop pesado, apenas mapeamento 1:1
      const pDrivers = rows.map((row: any) => ({
        id:        row.driver_id,
        name:      row.driver_name,
        count:     Number(row.pkg_count),
        amount:    Number(row.total_repasse).toFixed(2).replace('.', ','),
        rawAmount: Number(row.total_repasse),
        status:    paymentMap[row.driver_id] || 'Pendente',
        packages:  null // carregado sob demanda ao abrir o modal
      }));
      // Já vem ordenado pelo banco (ORDER BY pkg_count DESC)

      setPagamentos(pDrivers);

      const totalMs = (performance.now() - t0Total).toFixed(0);
      console.info(`[Pagamentos] ⏱ Tempo total de carregamento da página: ${totalMs}ms`);
      console.info(`[Pagamentos] └─ RPC SQL: ${rpcMs}ms | JS + rede: ${(Number(totalMs) - Number(rpcMs)).toFixed(0)}ms`);
    } catch (err: any) {
      console.error(err);
      alert('Erro ao carregar pagamentos');
    } finally {
      setIsLoading(false);
    }
  };

  /** Busca os pacotes detalhados de um entregador sob demanda (ao abrir o modal) */
  const fetchDriverDetails = useCallback(async (driverId: string) => {
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);

    const { data: pkgs, error } = await fetchAllPaginated(() => supabase
      .from('packages')
      .select(`
        id,
        barcode,
        scanned_at,
        delivery_value_snapshot,
        driver_bonus_snapshot,
        companies (name)
      `)
      .eq('driver_id', driverId)
      .gte('scanned_at', startOfMonth.toISOString())
      .lte('scanned_at', endOfMonth.toISOString())
    );

    if (error) throw error;

    const packages = (pkgs || []).map((p: any) => {
      const val = Number(p.delivery_value_snapshot || 0);
      const bon = Number(p.driver_bonus_snapshot || 0);
      return {
        id: p.id,
        barcode: p.barcode,
        company: p.companies?.name || 'Desconhecida',
        date: new Date(p.scanned_at).toLocaleDateString('pt-BR'),
        time: new Date(p.scanned_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        value: val + bon,
        rawDate: p.scanned_at
      };
    }).sort((a: any, b: any) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());

    return packages;
  }, [currentDate]);

  const updateStatus = async (driverId: string, driverName: string, newStatus: string, rawAmount: number) => {
    // Optimistic UI update
    setPagamentos(prev => prev.map(p => p.id === driverId ? { ...p, status: newStatus } : p));

    // Rolar para "Já Pagos" ao marcar como pago
    if (newStatus === 'Pago') {
      setTimeout(() => {
        pagosSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }

    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    const isoStart = localDateStr(startOfMonth);
    const isoEnd = localDateStr(endOfMonth);

    try {
      const { error } = await supabase
        .from('driver_payments')
        .upsert({
          driver_id: driverId,
          period_start: isoStart,
          period_end: isoEnd,
          amount: rawAmount,
          status: newStatus
        }, { onConflict: 'driver_id, period_start, period_end' });

      if (error) throw error;

      const userRes = await supabase.auth.getUser();
      const adminEmail = userRes.data.user?.email || 'admin@sistema';
      
      const actionStr = newStatus === 'Pago' ? 'MARCOU COMO PAGO' : 'MARCOU COMO PENDENTE';
      await logAction(adminEmail, 'EDITOU', 'PAGAMENTO', `${driverName} (${actionStr})`);

      // Atualizar alerta de atrasados
      fetchAtrasados();

    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('does not exist')) {
        alert('A tabela de pagamentos ainda não foi criada. Execute o comando SQL no Supabase.');
      } else {
        alert('Erro ao salvar status.');
      }
      fetchPagamentos(); // Revert
    }
  };

  const openDriverDetails = async (driver: any) => {
    // Abre o modal imediatamente com os dados já disponíveis
    setSelectedDriver({ ...driver, packages: null });
    setIsModalOpen(true);
    setIsLoadingDetails(true);
    try {
      const packages = await fetchDriverDetails(driver.id);
      setSelectedDriver((prev: any) => prev ? { ...prev, packages } : prev);
    } catch (err) {
      console.error('Erro ao carregar detalhes do entregador:', err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const pendentes = pagamentos.filter(p => p.status !== 'Pago');
  const pagos = pagamentos.filter(p => p.status === 'Pago');

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Pagamentos</h1>
          <p className="text-muted-foreground">Controle de repasses mensais aos entregadores.</p>
        </div>

        {/* Mês Navegação */}
        <div className="flex items-center gap-4 bg-muted/30 p-2 rounded-lg border border-border">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2 min-w-[150px] justify-center font-semibold text-primary">
            <Calendar className="w-4 h-4" />
            {getMonthName(currentDate)}
          </div>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* ⚠️ Alerta de Pagamentos Atrasados */}
      {atrasados.length > 0 && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 space-y-3 shadow-md">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <h2 className="font-bold text-red-600 text-base">Pagamentos Atrasados!</h2>
            <span className="ml-auto text-xs text-red-400 font-medium bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
              {atrasados.reduce((acc, a) => acc + a.drivers.length, 0)} pendência{atrasados.reduce((acc, a) => acc + a.drivers.length, 0) !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-sm text-red-500/80">
            Os seguintes entregadores ainda não receberam o repasse de meses anteriores:
          </p>
          <div className="space-y-2">
            {atrasados.map((a, idx) => (
              <div key={idx} className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
                <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-1.5 capitalize">
                  📅 {a.month}
                </p>
                <div className="flex flex-wrap gap-2">
                  {a.drivers.map((driverName, di) => (
                    <span
                      key={di}
                      className="inline-flex items-center gap-2 text-sm font-semibold bg-red-700/30 border border-red-500/50 text-red-100 px-3 py-1.5 rounded-lg"
                    >
                      <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                      {driverName}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-red-400/70">
            💡 Navegue para o mês correspondente para realizar os pagamentos atrasados.
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center p-12"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>
      ) : (
        <div className="grid grid-cols-1 gap-8">
          
          {/* Tabela de PENDENTES */}
          <Card className="border-amber-500/20 shadow-md">
            <CardHeader className="bg-amber-500/5 pb-4 border-b border-border">
              <CardTitle className="text-xl flex items-center gap-2 text-amber-600">
                <Clock className="w-5 h-5" /> A Pagar (Pendentes)
              </CardTitle>
              <CardDescription>Entregadores que ainda não receberam o repasse do mês.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/10 border-b border-border">
                    <tr>
                      <th className="px-6 py-4 font-medium">Entregador</th>
                      <th className="px-6 py-4 font-medium text-center">Entregas no Mês</th>
                      <th className="px-6 py-4 font-medium text-right">Valor Devido</th>
                      <th className="px-6 py-4 font-medium text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pendentes.map((row) => (
                      <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Button variant="ghost" onClick={() => openDriverDetails(row)} className="font-semibold text-primary hover:underline px-0 h-auto">
                              {row.name}
                            </Button>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center text-muted-foreground">
                          {row.count} pacotes
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-amber-500">
                          R$ {row.amount}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => openDriverDetails(row)}>
                              <Eye className="w-4 h-4 mr-2" /> Detalhes
                            </Button>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => updateStatus(row.id, row.name, 'Pago', row.rawAmount)}>
                              <CheckCircle2 className="w-4 h-4 mr-2" /> Pagar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {pendentes.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">Nenhum pagamento pendente neste mês.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Tabela de PAGOS */}
          <div ref={pagosSectionRef}>
          <Card className="border-emerald-500/20 shadow-md opacity-90">
            <CardHeader className="bg-emerald-500/5 pb-4 border-b border-border">
              <CardTitle className="text-xl flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="w-5 h-5" /> Já Pagos
              </CardTitle>
              <CardDescription>Entregadores que já receberam o repasse referente a este mês.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/10 border-b border-border">
                    <tr>
                      <th className="px-6 py-4 font-medium">Entregador</th>
                      <th className="px-6 py-4 font-medium text-center">Entregas no Mês</th>
                      <th className="px-6 py-4 font-medium text-right">Valor Pago</th>
                      <th className="px-6 py-4 font-medium text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pagos.map((row) => (
                      <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4">
                          <Button variant="ghost" onClick={() => openDriverDetails(row)} className="font-semibold text-primary hover:underline px-0 h-auto">
                            {row.name}
                          </Button>
                        </td>
                        <td className="px-6 py-4 text-center text-muted-foreground">
                          {row.count} pacotes
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-emerald-600">
                          R$ {row.amount}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 border border-emerald-200">
                              Pago
                            </span>
                            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-xs h-7" onClick={() => updateStatus(row.id, row.name, 'Pendente', row.rawAmount)}>
                              Desfazer
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {pagos.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">Nenhum pagamento registrado neste mês.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          </div>
        </div>
      )}

      {/* Modal de Detalhes */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[700px] border-border bg-card max-h-[85vh] overflow-y-auto flex flex-col">
          <DialogHeader className="pb-4 border-b border-border">
            <DialogTitle className="text-xl flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" /> 
              Entregas do Mês - {selectedDriver?.name}
            </DialogTitle>
          </DialogHeader>
          
          {selectedDriver && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 p-4 rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Total de Pacotes</p>
                  <p className="text-2xl font-bold">{selectedDriver.count}</p>
                </div>
                <div className="bg-primary/10 p-4 rounded-lg border border-primary/20">
                  <p className="text-xs text-primary/70 uppercase mb-1">Total Gerado</p>
                  <p className="text-2xl font-bold text-primary">R$ {selectedDriver.amount}</p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2 mt-4">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  Lista de Pacotes Bipados
                </h3>
                <div className="border border-border rounded-lg overflow-hidden">
                  {isLoadingDetails ? (
                    <div className="flex justify-center items-center py-10">
                      <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="max-h-[350px] overflow-y-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border sticky top-0 backdrop-blur-md">
                          <tr>
                            <th className="px-4 py-3 font-medium">Código</th>
                            <th className="px-4 py-3 font-medium">Empresa</th>
                            <th className="px-4 py-3 font-medium">Data</th>
                            <th className="px-4 py-3 font-medium">Hora</th>
                            <th className="px-4 py-3 font-medium text-right">Repasse</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(selectedDriver.packages || []).map((pkg: any) => (
                            <tr key={pkg.id} className="hover:bg-muted/30">
                              <td className="px-4 py-3 font-medium text-foreground">{pkg.barcode}</td>
                              <td className="px-4 py-3">{pkg.company}</td>
                              <td className="px-4 py-3">{pkg.date}</td>
                              <td className="px-4 py-3 text-muted-foreground">{pkg.time}</td>
                              <td className="px-4 py-3 text-right text-emerald-500 font-medium">
                                R$ {pkg.value.toFixed(2).replace('.', ',')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
