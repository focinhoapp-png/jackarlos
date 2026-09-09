import React, { useState, useEffect, useCallback } from 'react';
import { Trophy, Medal, Star, TrendingUp, Package, Building2, Calendar, RotateCcw, CheckCircle2, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { supabase } from '@/src/lib/supabase';
import {
  rankingCacheKey,
  getRankingCache,
  setRankingCache,
  type RankingDriver,
  type RankingCompany,
} from '@/src/lib/rankingCache';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type PeriodType = 'Semanal' | 'Mensal' | 'Anual' | 'Personalizado';

// ─── Logger de performance ────────────────────────────────────────────────────

class PerfLogger {
  private marks: Record<string, number> = {};
  private logs: { label: string; ms: number }[] = [];
  private startTime = performance.now();

  mark(label: string) {
    this.marks[label] = performance.now();
  }

  measure(label: string, from: string, to: string) {
    const ms = Math.round(this.marks[to] - this.marks[from]);
    this.logs.push({ label, ms });
    return ms;
  }

  elapsed(label: string) {
    const ms = Math.round(performance.now() - this.startTime);
    this.logs.push({ label, ms });
    return ms;
  }

  report(extra: Record<string, unknown> = {}) {
    const total = Math.round(performance.now() - this.startTime);
    console.groupCollapsed(
      `%c[RANKING] ⚡ Total: ${total}ms`,
      'color: #22c55e; font-weight: bold; font-size: 13px;'
    );
    console.table(this.logs.map(l => ({ 'Etapa': l.label, 'Tempo (ms)': l.ms })));
    if (Object.keys(extra).length) console.log('Detalhes:', extra);
    console.groupEnd();
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function Ranking() {
  const [period, setPeriod] = useState<PeriodType>('Semanal');
  const [dateStart, setDateStart] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dateEnd, setDateEnd] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ── Fase 1: KPIs (aparecem primeiro)
  const [isLoadingKPIs, setIsLoadingKPIs] = useState(true);
  // ── Fase 2: Rankings (aparecem após KPIs)
  const [isLoadingRankings, setIsLoadingRankings] = useState(true);

  const [topEntregadores, setTopEntregadores] = useState<RankingDriver[]>([]);
  const [topEmpresas, setTopEmpresas] = useState<RankingCompany[]>([]);

  // ── buildDateRange — mesmas regras de negócio originais ──────────────────
  const buildDateRange = useCallback((): { start: Date; end: Date } => {
    const now = new Date();

    if (period === 'Personalizado') {
      const start = new Date(dateStart + 'T00:00:00');
      const end = new Date(dateEnd + 'T23:59:59');
      return { start, end };
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    if (period === 'Semanal') {
      start.setDate(start.getDate() - start.getDay());
    } else if (period === 'Mensal') {
      start.setDate(1);
    } else if (period === 'Anual') {
      start.setMonth(0, 1);
    }

    return { start, end: now };
  }, [period, dateStart, dateEnd]);

  // ── Fetch com RPC agregada + cache + lazy loading ─────────────────────────
  const fetchRankingData = useCallback(async () => {
    const perf = new PerfLogger();
    perf.mark('start');

    const { start, end } = buildDateRange();
    const cacheKey = rankingCacheKey(start, end);

    // ── Fase 0: verificar cache ────────────────────────────────────────────
    const cached = getRankingCache(cacheKey);
    if (cached) {
      console.log('%c[RANKING] Cache HIT ✓', 'color: #3b82f6; font-weight:bold;');

      // Fase 1 — KPIs instantâneos do cache
      setIsLoadingKPIs(true);
      setIsLoadingRankings(true);
      setTopEntregadores(cached.drivers);
      setTopEmpresas(cached.companies);
      setIsLoadingKPIs(false);

      // Fase 2 — Rankings no próximo frame (efeito de lazy render)
      requestAnimationFrame(() => {
        setIsLoadingRankings(false);
      });

      perf.elapsed('cache hit → render');
      perf.report({ source: 'cache' });
      return;
    }

    // ── Cache MISS: buscar no banco ────────────────────────────────────────
    console.log('%c[RANKING] Cache MISS — buscando no banco…', 'color: #f59e0b; font-weight:bold;');
    setIsLoadingKPIs(true);
    setIsLoadingRankings(true);

    try {
      perf.mark('rpc_start');

      // UMA única chamada RPC — toda agregação acontece no PostgreSQL
      const { data, error } = await supabase.rpc('get_ranking_data', {
        p_start: start.toISOString(),
        p_end:   end.toISOString(),
      });

      perf.mark('rpc_end');
      perf.measure('RPC get_ranking_data (network)', 'rpc_start', 'rpc_end');

      if (error) throw error;

      const payload = data as {
        drivers: RankingDriver[];
        companies: RankingCompany[];
        totals: { total_entregas: number; total_mercadorias: number };
        meta: { query_time_ms: number };
      };

      // ── Fase 1: KPIs aparecem imediatamente ─────────────────────────────
      setTopEntregadores(payload.drivers ?? []);
      setTopEmpresas(payload.companies ?? []);
      setIsLoadingKPIs(false);
      perf.elapsed('KPIs renderizados');

      // ── Fase 2: Rankings no próximo frame ───────────────────────────────
      requestAnimationFrame(() => {
        setIsLoadingRankings(false);
        perf.elapsed('Rankings renderizados');
      });

      // ── Gravar no cache ─────────────────────────────────────────────────
      setRankingCache(cacheKey, payload);

      // ── Relatório de performance ─────────────────────────────────────────
      perf.elapsed('total');
      perf.report({
        source: 'rpc',
        'DB query_time_ms': payload.meta?.query_time_ms,
        'Rows retornados': `${(payload.drivers?.length ?? 0) + (payload.companies?.length ?? 0)} (era potencialmente milhares)`,
        'Round-trips': '1 (era 3–9 paginados)',
        'Entregadores retornados': payload.drivers?.length ?? 0,
        'Empresas retornadas': payload.companies?.length ?? 0,
        'total_entregas': payload.totals?.total_entregas,
        'total_mercadorias': payload.totals?.total_mercadorias,
      });

    } catch (err) {
      console.error('[RANKING] Erro ao buscar dados:', err);
      setIsLoadingKPIs(false);
      setIsLoadingRankings(false);
    }
  }, [buildDateRange]);

  useEffect(() => {
    fetchRankingData();
  }, [fetchRankingData]);

  // ── Derivados para os cards de KPI (idênticos ao original) ───────────────
  const topEntregadorFullName = topEntregadores[0]?.name ?? 'Nenhum';
  const topEntregadorName     = topEntregadorFullName !== 'Nenhum'
    ? topEntregadorFullName.split(' ')[0]
    : 'Nenhum';
  const topEntregadorPhoto  = topEntregadores[0]?.photo_url ?? null;
  const topEntregadorAvatar = topEntregadores[0]?.avatar ?? '';
  const topEmpresaName      = topEmpresas[0]?.name ?? 'Nenhuma';
  const topEmpresaLogo      = topEmpresas[0]?.logo_url ?? null;
  const topEmpresaColor     = topEmpresas[0]?.color ?? '#3b82f6';
  const topFaturamento      = topEntregadores[0]?.formattedAmount ?? 'R$ 0,00';
  const topProdutividade    = topEntregadores[0]?.total ?? 0;

  const periodLabels: Record<PeriodType, string> = {
    Semanal:      'Semanal',
    Mensal:       'Mensal',
    Anual:        'Anual',
    Personalizado: 'Personalizado',
  };
  void periodLabels; // referência para evitar warning de unused

  const formatDate = (d: string) => {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  };

  const customRangeLabel = dateStart === dateEnd
    ? formatDate(dateStart)
    : `${formatDate(dateStart)} → ${formatDate(dateEnd)}`;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — UI 100% idêntica ao original
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-24 p-4 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Ranking Geral</h1>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro de período */}
          <div className="bg-card border border-border rounded-lg p-1 flex shadow-sm">
            {(['Semanal', 'Mensal', 'Anual'] as PeriodType[]).map(p => (
              <button
                key={p}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  period === p
                    ? 'bg-primary text-primary-foreground shadow'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
                onClick={() => { setPeriod(p); setShowDatePicker(false); }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Picker de período personalizado */}
          <div className="relative">
            <button
              onClick={() => { setShowDatePicker(v => !v); if (period !== 'Personalizado') setPeriod('Personalizado'); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all shadow-sm ${
                period === 'Personalizado'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
              }`}
            >
              <Calendar className="h-4 w-4" />
              {period === 'Personalizado' ? customRangeLabel : 'Período'}
              <ChevronDown className={`h-3 w-3 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
            </button>

            {showDatePicker && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-xl shadow-xl p-4 w-72">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                  Selecionar Período
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Data de início</label>
                    <input
                      type="date"
                      value={dateStart}
                      max={dateEnd}
                      onChange={e => { setDateStart(e.target.value); setPeriod('Personalizado'); }}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Data de fim</label>
                    <input
                      type="date"
                      value={dateEnd}
                      min={dateStart}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={e => { setDateEnd(e.target.value); setPeriod('Personalizado'); }}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>

                {dateStart && dateEnd && (
                  <p className="mt-3 text-xs text-muted-foreground text-center">
                    {formatDate(dateStart)} até {formatDate(dateEnd)}
                  </p>
                )}

                <button
                  onClick={() => { setPeriod('Personalizado'); setShowDatePicker(false); }}
                  className="mt-4 w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Aplicar Filtro
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Cards de KPI (Fase 1 — aparecem primeiro) ─────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Entregador do Período */}
        <Card className="bg-card shadow-sm border-amber-500/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              {isLoadingKPIs ? (
                <div className="h-12 w-12 rounded-full bg-muted animate-pulse shrink-0" />
              ) : topEntregadorPhoto ? (
                <img
                  src={topEntregadorPhoto}
                  alt="Top Entregador"
                  className="h-12 w-12 rounded-full object-cover border-2 border-amber-500/20 shadow-sm"
                />
              ) : (
                <div className="h-12 w-12 flex min-w-[48px] items-center justify-center bg-amber-500/10 rounded-full border-2 border-background shadow-sm">
                  <span className="text-sm font-bold text-amber-600">
                    {topEntregadorAvatar || <Trophy className="h-6 w-6 text-yellow-500" />}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Entregador do Período</p>
                {isLoadingKPIs ? (
                  <div className="h-4 w-24 bg-muted rounded animate-pulse mt-1" />
                ) : (
                  <p className="font-bold text-sm sm:text-base leading-tight truncate text-foreground" title={topEntregadorName}>
                    {topEntregadorName}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Empresa */}
        <Card className="bg-card shadow-sm border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              {isLoadingKPIs ? (
                <div className="h-12 w-12 rounded-full bg-muted animate-pulse shrink-0" />
              ) : topEmpresaLogo ? (
                <div
                  className="h-12 w-12 rounded-full border-2 shadow-sm flex items-center justify-center overflow-hidden bg-white p-1"
                  style={{ borderColor: `${topEmpresaColor}40` }}
                >
                  <img src={topEmpresaLogo} alt="Top Empresa" className="max-w-full max-h-full object-contain" />
                </div>
              ) : (
                <div className="h-12 w-12 flex min-w-[48px] items-center justify-center bg-primary/10 rounded-full">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Top Empresa</p>
                {isLoadingKPIs ? (
                  <div className="h-4 w-20 bg-muted rounded animate-pulse mt-1" />
                ) : (
                  <p className="font-bold text-sm sm:text-base leading-tight truncate text-foreground" title={topEmpresaName}>
                    {topEmpresaName}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Maior Faturamento */}
        <Card className="bg-card shadow-sm border-emerald-500/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 flex items-center justify-center bg-emerald-500/10 rounded-full">
                <TrendingUp className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Maior Faturamento</p>
                {isLoadingKPIs ? (
                  <div className="h-5 w-28 bg-muted rounded animate-pulse mt-1" />
                ) : (
                  <p className="font-bold text-lg leading-tight text-emerald-600">{topFaturamento}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Maior Produtividade */}
        <Card className="bg-card shadow-sm border-blue-500/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 flex items-center justify-center bg-blue-500/10 rounded-full">
                <Package className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Maior Produtividade</p>
                {isLoadingKPIs ? (
                  <div className="h-5 w-28 bg-muted rounded animate-pulse mt-1" />
                ) : (
                  <p className="font-bold text-lg leading-tight text-foreground">{topProdutividade} Entregas</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Rankings (Fase 2 — aparecem logo após os KPIs) ────────────────── */}
      {isLoadingRankings ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Top Entregadores */}
          <Card className="bg-card shadow-md border-border">
            <CardHeader className="border-b border-border bg-muted/20 pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Top Entregadores
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {topEntregadores.map((ent, idx) => (
                  <div key={ent.id ?? idx} className="p-4 hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-3 mb-3">
                      {/* Medalha */}
                      <div className="w-8 flex justify-center shrink-0">
                        {idx === 0 ? <Medal className="h-7 w-7 text-yellow-500 drop-shadow-md" /> :
                         idx === 1 ? <Medal className="h-6 w-6 text-slate-400" /> :
                         idx === 2 ? <Medal className="h-6 w-6 text-amber-700" /> :
                         <span className="font-bold text-muted-foreground text-lg">{idx + 1}º</span>}
                      </div>

                      {/* Avatar */}
                      {ent.photo_url ? (
                        <img
                          src={ent.photo_url}
                          alt={ent.name}
                          className="h-11 w-11 rounded-full object-cover border-2 border-background shadow-sm shrink-0"
                        />
                      ) : (
                        <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center border-2 border-background shadow-sm shrink-0">
                          <span className="text-sm font-bold text-primary">{ent.avatar}</span>
                        </div>
                      )}

                      {/* Nome + bipadas */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground text-base truncate">{ent.name}</p>
                        <p className="text-xs text-muted-foreground">{ent.total} bipadas no período</p>
                      </div>

                      {/* % do total */}
                      <div className="shrink-0 text-right">
                        <span className="text-sm font-bold text-primary">{ent.pctDoTotal}%</span>
                        <p className="text-[10px] text-muted-foreground">do total</p>
                      </div>
                    </div>

                    {/* Barra proporcional + stats */}
                    <div className="ml-11 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700 bg-primary"
                            style={{ width: `${ent.barWidth}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 text-emerald-500 font-medium">
                          <CheckCircle2 className="h-3 w-3" />
                          {ent.entregues} entregues ({ent.pctEntregues}%)
                        </span>
                        {ent.devolvidas > 0 ? (
                          <span className="flex items-center gap-1 text-red-400 font-medium">
                            <RotateCcw className="h-3 w-3" />
                            {ent.devolvidas} devolvidas ({ent.pctDevolvidas}%)
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <RotateCcw className="h-3 w-3" />
                            0 devolvidas
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {topEntregadores.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">Nenhum dado neste período.</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Top Empresas */}
          <Card className="bg-card shadow-md border-border">
            <CardHeader className="border-b border-border bg-muted/20 pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Star className="h-5 w-5 text-primary" />
                Top Empresas
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {topEmpresas.map((emp, idx) => (
                  <div key={emp.id ?? idx} className="p-4 hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-3 mb-3">
                      {/* Medalha */}
                      <div className="w-8 flex justify-center shrink-0">
                        {idx === 0 ? <Medal className="h-7 w-7 text-yellow-500 drop-shadow-md" /> :
                         idx === 1 ? <Medal className="h-6 w-6 text-slate-400" /> :
                         idx === 2 ? <Medal className="h-6 w-6 text-amber-700" /> :
                         <span className="font-bold text-muted-foreground text-lg">{idx + 1}º</span>}
                      </div>

                      {/* Logo */}
                      {emp.logo_url ? (
                        <div className="h-11 w-11 rounded-lg border border-border shadow-sm flex items-center justify-center overflow-hidden bg-white p-1 shrink-0">
                          <img src={emp.logo_url} alt={emp.name} className="max-w-full max-h-full object-contain" />
                        </div>
                      ) : (
                        <div
                          className="h-11 w-11 flex items-center justify-center rounded-lg border shadow-sm shrink-0"
                          style={{ backgroundColor: `${emp.color}20`, borderColor: emp.color }}
                        >
                          <Building2 className="h-6 w-6" style={{ color: emp.color }} />
                        </div>
                      )}

                      {/* Nome + mercadorias */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground text-base truncate">{emp.name}</p>
                        <p className="text-xs text-muted-foreground">{emp.count} mercadorias</p>
                      </div>

                      {/* % do total */}
                      <div className="shrink-0 text-right">
                        <span className="text-sm font-bold" style={{ color: emp.color }}>{emp.pctDoTotal}%</span>
                        <p className="text-[10px] text-muted-foreground">do total</p>
                      </div>
                    </div>

                    {/* Barra proporcional */}
                    <div className="ml-11">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ backgroundColor: emp.color, width: `${emp.barWidth}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                          {emp.formattedAmount}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {topEmpresas.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">Nenhum dado neste período.</div>
                )}
              </div>
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  );
}
