import React, { useState, useEffect } from 'react';
import { User, CheckCircle2, Truck, GripVertical, Plus, Building2, Package, ChevronUp, ChevronDown, Search, Users, ListOrdered, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/src/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { Input } from "@/src/components/ui/input";
import { supabase } from '@/src/lib/supabase';
import { logAction } from '@/src/lib/audit';

interface Company {
  id: string;
  name: string;
  value_per_delivery: number;
  logo_url?: string;
}

interface DriverInfo {
  id: string;
  name: string;
  vehicle_type: string;
  vehicle_plate: string;
  base_location: string;
  bonus_per_delivery: number;
}

interface ScannedItem {
  code: string;
  companyId: string;
  companyName: string;
  time: string;
  status: 'success' | 'error';
  value: number;
  bonus?: number; // Bônus por empresa deste entregador (definido no momento do scan)
}

export function ScannerPanel() {
  const [allDrivers, setAllDrivers] = useState<DriverInfo[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [bases, setBases] = useState<string[]>([]);
  const [activeDeliveries, setActiveDeliveries] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActiveDelivery, setSelectedActiveDelivery] = useState<any | null>(null);
  const [adjustingCompany, setAdjustingCompany] = useState<string | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [finalizing, setFinalizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isSubmittingRef = React.useRef(false);
  const [loadingDriverId, setLoadingDriverId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  const [currentUserInfo, setCurrentUserInfo] = useState<{ id: string; name: string; email: string; role: string } | null>(null);

  // Controle de carregamento e concorrência para evitar flash de dados incorretos e race conditions
  const activeQueryIdRef = React.useRef(0);
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [queue, setQueue] = useState<DriverInfo[]>(() => {
    const saved = localStorage.getItem('driverQueueV3');
    if (saved) return JSON.parse(saved);
    return [];
  });

  const [activeTab, setActiveTab] = useState<'disponiveis' | 'fila' | 'em_rota'>('disponiveis');
  // Sempre abre com 'Nenhuma' selecionada por padrão ao entrar no módulo de Carregamentos
  const [selectedBase, setSelectedBase] = useState<string>('Nenhuma');
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [companyCounts, setCompanyCounts] = useState<Record<string, number>>({});
  // Bônus por empresa do entregador selecionado: { [company_id]: bonus_amount }
  const [driverBonusMap, setDriverBonusMap] = useState<Record<string, number>>({});
  
  const [lastScanStatus, setLastScanStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [draggedDriverId, setDraggedDriverId] = useState<string | null>(null);

  const handleBaseChange = (base: string) => {
    setSelectedBase(base);
    if (base === 'Nenhuma' || !base) {
      setActiveDeliveries([]);
      setIsLoadingDeliveries(false);
    } else {
      loadActiveDeliveries(base);
    }
  };

  /** Agrupa os pacotes em rota por entregador em memória, sem overhead de joins relacionais */
  const groupPackagesByDriver = (
    packages: any[],
    driversList: DriverInfo[],
    companiesList: Company[]
  ) => {
    if (!packages || packages.length === 0) return [];

    const driversMap = new Map(driversList.map(d => [String(d.id), d]));
    const companiesMap = new Map(companiesList.map(c => [String(c.id), c]));

    const grouped = packages.reduce((acc: any, pkg: any) => {
      const drv = driversMap.get(String(pkg.driver_id));
      const comp = companiesMap.get(String(pkg.company_id));

      if (!acc[pkg.driver_id]) {
        acc[pkg.driver_id] = {
          id: pkg.driver_id,
          driverName: drv?.name || 'Desconhecido',
          vehicle: drv?.vehicle_type || '-',
          plate: drv?.vehicle_plate || '-',
          baseLocation: pkg.base_location || drv?.base_location || null,
          scannedBy: pkg.scanned_by,
          scannedItems: []
        };
      } else if (!acc[pkg.driver_id].baseLocation && (pkg.base_location || drv?.base_location)) {
        acc[pkg.driver_id].baseLocation = pkg.base_location || drv?.base_location;
      }

      acc[pkg.driver_id].scannedItems.push({
        code: pkg.barcode,
        company: comp?.name || 'Desconhecida'
      });
      return acc;
    }, {});

    return Object.values(grouped);
  };

  /** Consulta de alta performance dos pacotes com status EM_ROTA da base selecionada utilizando o índice B-Tree idx_packages_driver_id */
  const fetchActivePackagesFromDb = async (targetBase?: string, driversList?: DriverInfo[]): Promise<any[]> => {
    if (!targetBase || targetBase === 'Nenhuma') {
      return [];
    }

    const t0 = performance.now();
    console.info(`[Carregamentos Diagnostic] Iniciando busca otimizada de pacotes EM_ROTA para base: "${targetBase}"`);

    // Obtém os motoristas da base para acionar o índice idx_packages_driver_id em vez de sequential scan
    let baseDrivers = (driversList && driversList.length > 0 ? driversList : allDrivers).filter(
      d => (d.base_location || '').toLowerCase() === targetBase.toLowerCase()
    );

    // Fallback de segurança se allDrivers ainda não foi setado no primeiro render
    if (baseDrivers.length === 0) {
      const { data: dbDrivers } = await supabase
        .from('drivers')
        .select('id, name, vehicle_type, vehicle_plate, base_location, bonus_per_delivery, status')
        .ilike('base_location', targetBase);
      if (dbDrivers && dbDrivers.length > 0) {
        baseDrivers = dbDrivers as DriverInfo[];
      }
    }

    if (baseDrivers.length === 0) {
      console.info(`[Carregamentos Diagnostic] Nenhum motorista encontrado na base "${targetBase}". Retornando vazio.`);
      return [];
    }

    // Consulta concorrente para cada motorista da base usando idx_packages_driver_id + status
    const driverQueries = baseDrivers.map(async (d) => {
      let driverPkgs: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('packages')
          .select('barcode, driver_id, company_id, base_location, scanned_by')
          .eq('status', 'EM_ROTA')
          .eq('driver_id', d.id)
          .range(from, from + 999);

        if (error) {
          console.error(`[Carregamentos Diagnostic] Erro ao buscar pacotes do motorista ${d.name}:`, error);
          break;
        }

        if (data && data.length > 0) {
          driverPkgs.push(...data);
          if (data.length < 1000) {
            hasMore = false;
          } else {
            from += 1000;
          }
        } else {
          hasMore = false;
        }
      }

      return driverPkgs;
    });

    const results = await Promise.all(driverQueries);
    const allPkgs = results.flat();

    const totalMs = (performance.now() - t0).toFixed(0);
    console.info(`[Carregamentos Diagnostic] Total pacotes em rota carregados para base "${targetBase}": ${allPkgs.length} pacotes em ${totalMs}ms (${baseDrivers.length} entregadores consultados concorrentemente)`);

    return allPkgs;
  };

  /** Busca inicial orquestrada: metadados estruturais leves primeiro, depois pacotes da base ativa */
  useEffect(() => {
    let isMounted = true;

    const loadAllInitialData = async () => {
      const queryId = ++activeQueryIdRef.current;
      setLoadError(null);

      try {
        const t0 = performance.now();
        console.info('[Carregamentos Diagnostic] Iniciando loadAllInitialData...');

        // 1. Carrega primeiro as tabelas estruturais leves em paralelo (< 200ms)
        const tMeta0 = performance.now();
        const [driversRes, companiesRes, basesRes] = await Promise.all([
          supabase.from('drivers').select('id, name, vehicle_type, vehicle_plate, base_location, bonus_per_delivery, status').order('name'),
          supabase.from('companies').select('id, name, value_per_delivery, logo_url').eq('status', true),
          supabase.from('bases').select('name').eq('status', true).order('name')
        ]);

        if (driversRes.error) throw new Error('Erro ao carregar entregadores: ' + driversRes.error.message);
        if (companiesRes.error) throw new Error('Erro ao carregar empresas: ' + companiesRes.error.message);
        if (basesRes.error) throw new Error('Erro ao carregar bases: ' + basesRes.error.message);

        // Descarte se outra requisição mais nova foi iniciada
        if (!isMounted || queryId !== activeQueryIdRef.current) return;

        const driversData = (driversRes.data as DriverInfo[]) || [];
        const companiesData = (companiesRes.data as Company[]) || [];
        const basesData = (basesRes.data ? basesRes.data.map((b: any) => b.name) : []) as string[];

        setAllDrivers(driversData);
        setCompanies(companiesData);
        setBases(basesData);

        const initialCounts: Record<string, number> = {};
        companiesData.forEach(c => { initialCounts[c.name] = 0; });
        setCompanyCounts(initialCounts);

        console.info(`[Carregamentos Diagnostic] Metadados carregados em ${(performance.now() - tMeta0).toFixed(0)}ms: ${driversData.length} entregadores, ${companiesData.length} empresas, ${basesData.length} bases`);

        // Sempre inicia com 'Nenhuma' selecionada por padrão ao entrar no módulo de Carregamentos
        setSelectedBase('Nenhuma');
        setActiveDeliveries([]);
        console.info(`[Carregamentos Diagnostic] Módulo aberto com "Nenhuma" selecionada por padrão. Carga inicial concluída em ${(performance.now() - t0).toFixed(0)}ms.`);
        return;

      } catch (err: any) {
        if (isMounted && queryId === activeQueryIdRef.current) {
          console.error('[Carregamentos Diagnostic] Erro na inicialização dos dados:', err);
          setLoadError(err.message || 'Falha ao conectar com o banco de dados.');
        }
      } finally {
        if (isMounted && queryId === activeQueryIdRef.current) {
          setIsLoadingDeliveries(false);
        }
      }
    };

    loadAllInitialData();

    // Carrega dados do usuário autenticado para auditoria
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user && isMounted) {
        setCurrentUserId(user.id);
        const { data: ud } = await supabase.from('users').select('name, email, role').eq('id', user.id).single();
        if (ud?.role && isMounted) setCurrentUserRole(ud.role);
        if (ud && isMounted) {
          setCurrentUserInfo({
            id: user.id,
            name: ud.name || '',
            email: ud.email || user.email || '',
            role: ud.role || ''
          });
        }
      }
    });

    return () => { isMounted = false; };
  }, []);

  const fetchInitialData = async () => {
    const [driversRes, companiesRes, basesRes] = await Promise.all([
      supabase.from('drivers').select('id, name, vehicle_type, vehicle_plate, base_location, bonus_per_delivery, status').order('name'),
      supabase.from('companies').select('id, name, value_per_delivery, logo_url').eq('status', true),
      supabase.from('bases').select('name').eq('status', true).order('name')
    ]);

    if (driversRes.error) throw new Error(driversRes.error.message);
    if (companiesRes.error) throw new Error(companiesRes.error.message);

    const driversData = (driversRes.data as DriverInfo[]) || [];
    const companiesData = (companiesRes.data as Company[]) || [];

    setAllDrivers(driversData);
    setCompanies(companiesData);

    const initialCounts: Record<string, number> = {};
    companiesData.forEach(c => { initialCounts[c.name] = 0; });
    setCompanyCounts(initialCounts);

    if (basesRes.data && basesRes.data.length > 0) {
      const baseNames = basesRes.data.map((b: any) => b.name);
      setBases(baseNames);
    }

    return {
      drivers: driversData,
      companies: companiesData,
      bases: basesRes.data ? basesRes.data.map((b: any) => b.name) : []
    };
  };

  /** Atualização sob demanda das entregas ativas (após finalização, devolução ou clique em atualizar) */
  const loadActiveDeliveries = async (
    targetBaseOverride?: string,
    customDrivers?: DriverInfo[],
    customCompanies?: Company[]
  ): Promise<any[]> => {
    const baseToQuery = targetBaseOverride !== undefined ? targetBaseOverride : selectedBase;

    if (!baseToQuery || baseToQuery === 'Nenhuma') {
      setActiveDeliveries([]);
      setIsLoadingDeliveries(false);
      return [];
    }

    const queryId = ++activeQueryIdRef.current;
    setIsLoadingDeliveries(true);
    setLoadError(null);

    try {
      const driversToUse = customDrivers || allDrivers;
      const companiesToUse = customCompanies || companies;

      const activePkgs = await fetchActivePackagesFromDb(baseToQuery, driversToUse);

      if (queryId !== activeQueryIdRef.current) {
        return [];
      }

      const mapped = groupPackagesByDriver(activePkgs, driversToUse, companiesToUse);
      setActiveDeliveries(mapped);
      return mapped;
    } catch (err: any) {
      if (queryId === activeQueryIdRef.current) {
        console.error('Erro ao atualizar entregas ativas:', err);
        setLoadError(err.message || 'Erro ao carregar entregas ativas.');
      }
      return [];
    } finally {
      if (queryId === activeQueryIdRef.current) {
        setIsLoadingDeliveries(false);
      }
    }
  };

  useEffect(() => {
    const totalCount = Object.values(companyCounts).reduce((a: number, b: number) => a + (b || 0), 0);
    const queueToSave = queue.map(d => {
      if (driver && d.id === driver.id) {
        return {
          ...d,
          totals: companyCounts,
          total: totalCount
        };
      }
      return {
        ...d,
        totals: {},
        total: 0
      };
    });
    localStorage.setItem('driverQueueV3', JSON.stringify(queueToSave));
    window.dispatchEvent(new Event('driverQueueUpdated'));
  }, [queue, driver, companyCounts]);

  // bases agora vêm direto do banco (tabela 'bases'), não dos entregadores

  const handleDragStart = (driverId: string) => setDraggedDriverId(driverId);
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
  const handleDrop = (targetDriverId: string) => {
    if (!draggedDriverId || draggedDriverId === targetDriverId) return;
    setQueue(prev => {
      const fromIndex = prev.findIndex(d => String(d.id) === String(draggedDriverId));
      const toIndex = prev.findIndex(d => String(d.id) === String(targetDriverId));
      if (fromIndex === -1 || toIndex === -1) return prev;
      const newQueue = [...prev];
      const [draggedItem] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, draggedItem);
      return newQueue;
    });
    setDraggedDriverId(null);
  };

  const addToQueue = (newDriver: DriverInfo) => {
    const driverWithBase: DriverInfo = {
      ...newDriver,
      base_location: newDriver.base_location || selectedBase || 'Guapimirim'
    };
    setQueue(prev => [...prev, driverWithBase]);
  };
  const removeFromQueue = (driverId: string) => setQueue(prev => prev.filter(d => d.id !== driverId));

  /** Carrega bônus por empresa do entregador e define como driver ativo */
  const handleSelectDriver = async (d: DriverInfo) => {
    if (loadingDriverId) return;
    setLoadingDriverId(d.id);
    try {
      const { data: bonusData } = await supabase
        .from('driver_company_bonuses')
        .select('company_id, bonus_amount')
        .eq('driver_id', d.id);

      const bonusMap: Record<string, number> = {};
      if (bonusData) {
        bonusData.forEach((b: any) => {
          bonusMap[b.company_id] = Number(b.bonus_amount);
        });
      }
      setDriverBonusMap(bonusMap);
      setDriver(d);
    } catch (err) {
      console.error('Erro ao carregar bônus do entregador:', err);
      setDriver(d);
    } finally {
      setLoadingDriverId(null);
    }
  };

  const handlePackageScan = () => {
    // Scanner simulado desativado — contagem manual ativa
  };

  const handleManualCountChange = (companyName: string, newCountStr: string) => {
    if (newCountStr === '') {
      setCompanyCounts(prev => ({ ...prev, [companyName]: 0 }));
      return;
    }

    const num = Number(newCountStr);
    if (isNaN(num) || num < 0) return;
    
    // Garante inteiro não negativo e limite de segurança razoável (100.000)
    const newCount = Math.min(100000, Math.floor(num));
    
    setCompanyCounts(prev => {
      if (prev[companyName] === newCount) return prev;
      return {
        ...prev,
        [companyName]: newCount
      };
    });
  };

  const handleCancelLoading = () => {
    setDriver(null);
    setDriverBonusMap({});
    const resetCounts: Record<string, number> = {};
    companies.forEach(c => { resetCounts[c.name] = 0; });
    setCompanyCounts(resetCounts);
  };

  const handleFinishLoading = async () => {
    // Prevenção contra múltiplos cliques e execuções concorrentes
    if (isSubmittingRef.current || isSaving) return;
    if (!driver) return;

    const totalToLoad = (Object.values(companyCounts) as number[]).reduce((a: number, b: number) => a + (b || 0), 0);
    if (totalToLoad <= 0) return;

    isSubmittingRef.current = true;
    setIsSaving(true);

    try {
      // Reutiliza dados do usuário autenticado já carregados na montagem
      let userId = currentUserInfo?.id || currentUserId;
      let userName = currentUserInfo?.name || '';
      let userEmail = currentUserInfo?.email || '';

      if (!userId) {
        const userRes = await supabase.auth.getUser();
        userId = userRes.data.user?.id || null;
        if (!userId) {
          alert("Erro: Usuário não autenticado!");
          return;
        }
        const { data: ud } = await supabase.from('users').select('name, email, role').eq('id', userId).single();
        userName = ud?.name || '';
        userEmail = ud?.email || userRes.data.user?.email || '';
      }

      // Gera o payload dos pacotes em memória somente no momento da finalização
      const insertPayload: any[] = [];
      for (const comp of companies) {
        const count = companyCounts[comp.name] || 0;
        if (count <= 0) continue;
        const bonusForCompany = driverBonusMap[comp.id] ?? 0;
        const deliveryValue = comp.value_per_delivery || 0;
        const baseLocation = driver.base_location || 'Guapimirim';

        for (let i = 0; i < count; i++) {
          insertPayload.push({
            barcode: `PKG-${crypto.randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase()}`,
            company_id: comp.id,
            driver_id: driver.id,
            scanned_by: userId,
            status: 'EM_ROTA',
            delivery_value_snapshot: deliveryValue,
            driver_bonus_snapshot: bonusForCompany,
            base_location: baseLocation
          });
        }
      }

      if (insertPayload.length === 0) return;

      // Inserção em lotes seguros de 500 registros, sem pausas artificiais (setTimeout)
      const chunkSize = 500;
      let hasError = false;
      let errorMessage = '';
      let insertedCount = 0;

      for (let i = 0; i < insertPayload.length; i += chunkSize) {
        try {
          const chunk = insertPayload.slice(i, i + chunkSize);
          const { error } = await supabase.from('packages').insert(chunk);
          if (error) {
            hasError = true;
            errorMessage = error.message;
            break;
          }
          insertedCount += chunk.length;
        } catch (err: any) {
          hasError = true;
          errorMessage = err.message || 'Erro de rede ou timeout';
          break;
        }
      }

      if (hasError) {
        if (insertedCount > 0) {
          alert(`Atenção: Apenas ${insertedCount} de ${insertPayload.length} pacotes foram salvos devido a um erro: ${errorMessage}`);
        } else {
          alert("Erro ao salvar pacotes: " + errorMessage);
        }
        await loadActiveDeliveries();
      } else {
        // Registrar log de auditoria
        await logAction(
          userEmail || userName || 'Desconhecido',
          'CARREGOU',
          'CARREGAMENTO',
          `${driver.name} — ${insertPayload.length} pacotes por ${userName || userEmail || 'Conferente'}`
        );

        removeFromQueue(driver.id);
        setDriver(null);
        setDriverBonusMap({});
        const resetCounts: Record<string, number> = {};
        companies.forEach(c => { resetCounts[c.name] = 0; });
        setCompanyCounts(resetCounts);
        await loadActiveDeliveries();
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleAdjustCompanyCount = async (driverId: string, companyName: string, direction: 'down' | 'up') => {
    setAdjustingCompany(companyName);
    try {
      const companyId = companies.find(c => c.name === companyName)?.id;
      if (!companyId) {
        setAdjustingCompany(null);
        return;
      }

      if (direction === 'down') {
        // Busca 1 pacote EM_ROTA desta empresa/entregador e marca como DEVOLVIDA
        const { data: pkgs } = await supabase
          .from('packages')
          .select('barcode')
          .eq('driver_id', driverId)
          .eq('company_id', companyId)
          .eq('status', 'EM_ROTA')
          .limit(1);

        const target = pkgs?.[0];
        if (!target) { setAdjustingCompany(null); return; }

        const { error } = await supabase
          .from('packages')
          .update({ status: 'DEVOLVIDA' })
          .eq('barcode', target.barcode);

        if (error) alert('Erro ao atualizar: ' + error.message);
      } else {
        // Busca 1 pacote DEVOLVIDA desta empresa/entregador e reverte para EM_ROTA
        const { data: pkgs } = await supabase
          .from('packages')
          .select('barcode')
          .eq('driver_id', driverId)
          .eq('company_id', companyId)
          .eq('status', 'DEVOLVIDA')
          .limit(1);

        const target = pkgs?.[0];
        if (!target) { setAdjustingCompany(null); return; }

        const { error } = await supabase
          .from('packages')
          .update({ status: 'EM_ROTA' })
          .eq('barcode', target.barcode);

        if (error) alert('Erro ao atualizar: ' + error.message);
      }

      await loadActiveDeliveries().then((freshList) => {
        setSelectedActiveDelivery((prev: any) => {
          if (!prev) return null;
          return freshList.find((d: any) => d.id === prev.id) || null;
        });
      });
    } finally {
      setAdjustingCompany(null);
    }
  };

  /** Marca N pacotes de uma empresa como DEVOLVIDA de uma vez (bulk) */
  const handleBulkReturn = async (driverId: string, companyName: string, qty: number) => {
    if (qty <= 0 || isNaN(qty)) return;
    const companyId = companies.find(c => c.name === companyName)?.id;
    if (!companyId) return;

    setAdjustingCompany(companyName);
    try {
      const { data: pkgs } = await supabase
        .from('packages')
        .select('barcode')
        .eq('driver_id', driverId)
        .eq('company_id', companyId)
        .eq('status', 'EM_ROTA')
        .limit(qty);

      if (!pkgs || pkgs.length === 0) {
        alert('Nenhum pacote em rota encontrado para esta empresa.');
        return;
      }

      const barcodes = pkgs.map((p: any) => p.barcode);
      const { error } = await supabase
        .from('packages')
        .update({ status: 'DEVOLVIDA' })
        .in('barcode', barcodes);

      if (error) {
        alert('Erro ao registrar devoluções: ' + error.message);
      } else {
        // Limpa o campo após sucesso
        setReturnQty(prev => ({ ...prev, [companyName]: '' }));
        await loadActiveDeliveries().then((freshList) => {
          setSelectedActiveDelivery((prev: any) => {
            if (!prev) return null;
            return freshList.find((d: any) => d.id === prev.id) || null;
          });
        });
      }
    } finally {
      setAdjustingCompany(null);
    }
  };

  const handleFinalizeDelivery = async () => {
    if (!selectedActiveDelivery) return;
    const total = selectedActiveDelivery.scannedItems?.length || 0;
    if (total === 0) return;
    const confirmed = window.confirm(
      `Confirmar que ${selectedActiveDelivery.driverName} finalizou todas as ${total} entregas em rota?`
    );
    if (!confirmed) return;
    setFinalizing(true);
    try {
      let userId = currentUserInfo?.id || currentUserId;
      let userName = currentUserInfo?.name || 'Desconhecido';
      let userEmail = currentUserInfo?.email || 'Desconhecido';

      if (!userId) {
        const userRes = await supabase.auth.getUser();
        userId = userRes.data.user?.id || null;
        if (userId) {
          const { data: ud } = await supabase.from('users').select('name, email').eq('id', userId).single();
          if (ud) {
            userName = ud.name || 'Desconhecido';
            userEmail = ud.email || 'Desconhecido';
          }
        }
      }

      const barcodes = selectedActiveDelivery.scannedItems.map((i: any) => i.code);
      
      const chunkSize = 500;
      let hasError = false;
      let errorMessage = '';

      for (let i = 0; i < barcodes.length; i += chunkSize) {
        try {
          const chunk = barcodes.slice(i, i + chunkSize);
          const { error } = await supabase
            .from('packages')
            .update({ status: 'ENTREGUE' })
            .in('barcode', chunk);
          
          if (error) {
            hasError = true;
            errorMessage = error.message;
            break;
          }
        } catch (err: any) {
          hasError = true;
          errorMessage = err.message || 'Erro de conexão';
          break;
        }
      }

      if (hasError) {
        alert('Erro ao finalizar entregas (algumas podem não ter sido finalizadas). Erro: ' + errorMessage);
      } else {
        let carregouName = 'Desconhecido';
        if (selectedActiveDelivery.scannedBy) {
           const { data: scanUser } = await supabase.from('users').select('name').eq('id', selectedActiveDelivery.scannedBy).single();
           if (scanUser && scanUser.name) carregouName = scanUser.name;
        }

        await logAction(
          userEmail !== 'Desconhecido' ? userEmail : userName,
          'FINALIZOU' as any,
          'CARREGAMENTO',
          `Entregas de ${selectedActiveDelivery.driverName} finalizadas. Carregado por: ${carregouName} | Finalizado por: ${userName}`
        );

        await loadActiveDeliveries();
        setSelectedActiveDelivery(null);
      }
    } finally {
      setFinalizing(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Simulação por ENTER desativada
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [driver, companies]);

  if (!driver) {
    const isNoneSelected = selectedBase === 'Nenhuma';
    const currentBase = isNoneSelected ? 'Nenhuma' : (selectedBase || bases[0] || 'Guapimirim');
    const normalize = (str?: string | null) => (str || '').trim().toLowerCase();
    const currentBaseNorm = normalize(currentBase);

    const getDriverBase = (d: { id: string | number; base_location?: string }) => {
      const match = allDrivers.find(item => String(item.id) === String(d.id));
      return normalize(d.base_location || match?.base_location || 'Guapimirim');
    };

    const getActiveDeliveryBase = (ad: any) => {
      const match = allDrivers.find(item => String(item.id) === String(ad.id));
      return normalize(ad.baseLocation || ad.base_location || match?.base_location || 'Guapimirim');
    };

    // 1. Entregadores Disponíveis (filtrados pela base selecionada, ou vazio se 'Nenhuma')
    const filteredAvailableDrivers = isNoneSelected ? [] : allDrivers.filter(d => 
      getDriverBase(d) === currentBaseNorm && 
      !queue.some(q => String(q.id) === String(d.id)) &&
      !activeDeliveries.some(ad => String(ad.id) === String(d.id))
    );

    // 2. Fila de Carregamento (filtrada pela base selecionada, ou vazio se 'Nenhuma')
    const filteredQueue = isNoneSelected ? [] : queue.filter(d => 
      getDriverBase(d) === currentBaseNorm
    );

    // 3. Em Rota (filtrados pela base selecionada, ou vazio se 'Nenhuma')
    const filteredActiveDeliveries = isNoneSelected ? [] : activeDeliveries.filter(ad => 
      getActiveDeliveryBase(ad) === currentBaseNorm
    );

    return (
      <div className="flex flex-col space-y-6 pb-8">
        {/* Top Header com Seletor de Base e Botão de Atualizar posicionado acima das abas */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/50">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Carregamentos</h1>
            <p className="text-sm text-muted-foreground">Gerencie entregadores disponíveis, fila e entregas em rota por base.</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-3 bg-card border border-border px-3.5 py-1.5 rounded-xl shadow-xs">
              <Building2 className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Base:</span>
              <div className="w-48 sm:w-56">
                <Select value={selectedBase} onValueChange={handleBaseChange}>
                  <SelectTrigger className="bg-background border-border shadow-none font-semibold text-foreground h-9">
                    <SelectValue placeholder="Selecione a Base" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Nenhuma" className="cursor-pointer font-medium">Nenhuma</SelectItem>
                    {bases.map(base => (
                      <SelectItem key={base} value={base} className="cursor-pointer font-medium">{base}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 border-border bg-card hover:bg-accent shrink-0 cursor-pointer"
              onClick={() => loadActiveDeliveries(selectedBase)}
              disabled={isNoneSelected || isLoadingDeliveries}
              title={isNoneSelected ? "Selecione uma base para atualizar" : "Atualizar dados"}
            >
              <RefreshCw className={`h-4 w-4 text-muted-foreground ${!isNoneSelected && isLoadingDeliveries ? 'animate-spin text-primary' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-border gap-1 sm:gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('disponiveis')}
            className={`flex items-center gap-2 pb-3.5 px-4 font-semibold text-sm transition-all border-b-2 -mb-px whitespace-nowrap cursor-pointer ${
              activeTab === 'disponiveis'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Disponíveis</span>
            <span className={`px-2 py-0.5 text-xs rounded-full font-bold transition-colors ${
              activeTab === 'disponiveis'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}>
              {isNoneSelected ? 0 : isLoadingDeliveries ? <Loader2 className="h-3 w-3 animate-spin inline" /> : filteredAvailableDrivers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fila')}
            className={`flex items-center gap-2 pb-3.5 px-4 font-semibold text-sm transition-all border-b-2 -mb-px whitespace-nowrap cursor-pointer ${
              activeTab === 'fila'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <ListOrdered className="h-4 w-4" />
            <span>Fila de carregamento</span>
            <span className={`px-2 py-0.5 text-xs rounded-full font-bold transition-colors ${
              activeTab === 'fila'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}>
              {isNoneSelected ? 0 : isLoadingDeliveries ? <Loader2 className="h-3 w-3 animate-spin inline" /> : filteredQueue.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('em_rota')}
            className={`flex items-center gap-2 pb-3.5 px-4 font-semibold text-sm transition-all border-b-2 -mb-px whitespace-nowrap cursor-pointer ${
              activeTab === 'em_rota'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Truck className="h-4 w-4" />
            <span>Em rota</span>
            <span className={`px-2 py-0.5 text-xs rounded-full font-bold transition-colors ${
              activeTab === 'em_rota'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}>
              {isNoneSelected ? 0 : isLoadingDeliveries ? <Loader2 className="h-3 w-3 animate-spin inline" /> : filteredActiveDeliveries.length}
            </span>
          </button>
        </div>

        {/* Tab 1: Disponíveis */}
        {activeTab === 'disponiveis' && (
          <div className="space-y-6">
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-bold tracking-tight mb-1">Entregadores Disponíveis</h2>
                <p className="text-muted-foreground text-sm">
                  {isNoneSelected ? 'Selecione uma base no menu superior para visualizar os entregadores.' : `Entregadores aptos para novo carregamento na base ${currentBase}.`}
                </p>
              </div>

              {isNoneSelected ? (
                <div className="p-8 text-center bg-card border border-border rounded-xl text-muted-foreground text-sm">
                  Selecione uma base no menu superior para visualizar os entregadores disponíveis.
                </div>
              ) : isLoadingDeliveries ? (
                <div className="p-12 text-center bg-card border border-border rounded-xl space-y-3">
                  <div className="h-8 w-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin mx-auto" />
                  <p className="text-sm font-medium text-muted-foreground animate-pulse">
                    Carregando entregadores e cargas em rota da base {currentBase}...
                  </p>
                </div>
              ) : loadError ? (
                <div className="p-6 bg-destructive/10 border border-destructive/20 rounded-xl text-center space-y-3">
                  <div className="flex items-center justify-center gap-2 text-destructive font-semibold text-sm">
                    <AlertCircle className="h-5 w-5" />
                    <span>{loadError}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => loadActiveDeliveries(selectedBase)} className="border-destructive/30 hover:bg-destructive/10 text-destructive cursor-pointer">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Tentar novamente
                  </Button>
                </div>
              ) : filteredAvailableDrivers.length === 0 ? (
                <div className="p-8 text-center bg-card border border-border rounded-xl text-muted-foreground text-sm">
                  Todos os entregadores da base {currentBase} já estão na fila ou em rota.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredAvailableDrivers.map((d) => (
                    <Card key={d.id} className="bg-card border-border">
                      <CardContent className="p-4 flex flex-col items-center text-center space-y-3 relative">
                        <div className="h-12 w-12 bg-secondary rounded-full flex items-center justify-center border-2 border-primary/10">
                          <User className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm line-clamp-1" title={d.name}>{d.name}</h3>
                          <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                            <Truck className="h-3 w-3"/> {d.vehicle_type || '-'}
                          </p>
                          <p className="text-xs font-mono bg-secondary px-2 py-0.5 rounded mt-1 inline-block">{d.vehicle_plate || 'Sem Placa'}</p>
                        </div>
                        <div className="w-full pt-3 border-t border-border flex justify-center">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full gap-2 border-primary/20 hover:bg-primary/5 hover:text-primary"
                            onClick={() => addToQueue(d)}
                          >
                            <Plus className="h-4 w-4" />
                            Adicionar à Fila
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Fila de carregamento */}
        {activeTab === 'fila' && (
          <div className="space-y-6">
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-bold tracking-tight mb-1">Fila de Carregamento</h2>
                <p className="text-muted-foreground text-sm">
                  {isNoneSelected ? 'Selecione uma base no menu superior para visualizar a fila.' : `Arraste os entregadores para organizar a ordem de carregamento na base ${currentBase}.`}
                </p>
              </div>
              
              {isNoneSelected ? (
                <div className="p-8 text-center bg-card border border-border rounded-xl text-muted-foreground text-sm">
                  Selecione uma base no menu superior para visualizar a fila de carregamento.
                </div>
              ) : isLoadingDeliveries ? (
                <div className="p-12 text-center bg-card border border-border rounded-xl space-y-3">
                  <div className="h-8 w-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin mx-auto" />
                  <p className="text-sm font-medium text-muted-foreground animate-pulse">
                    Carregando fila de carregamento da base {currentBase}...
                  </p>
                </div>
              ) : filteredQueue.length === 0 ? (
                <div className="p-12 text-center bg-card border border-border rounded-xl text-muted-foreground space-y-3">
                  <p className="text-sm">A fila está vazia para a base {currentBase}.</p>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('disponiveis')}>
                    Ver entregadores disponíveis
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredQueue.map((d, index) => {
                    const isFirst = index === 0;
                    return (
                      <div 
                        key={d.id}
                        draggable
                        onDragStart={() => handleDragStart(d.id)}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(d.id)}
                        className="h-full"
                      >
                        <Card 
                          className={`relative overflow-hidden cursor-pointer transition-all hover:shadow-md h-full flex flex-col ${isFirst ? 'border-primary shadow-[0_0_15px_rgba(59,130,246,0.15)] bg-primary/5' : 'bg-card border-border hover:border-primary/50'}`}
                          onClick={() => !loadingDriverId && handleSelectDriver(d)}
                        >
                          {isFirst && (
                            <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
                          )}
                          <CardContent className="p-4 flex flex-col items-center text-center space-y-3 relative flex-1">
                            <div className="absolute top-2 right-2 text-muted-foreground opacity-50 cursor-grab hover:opacity-100">
                              <GripVertical className="h-5 w-5" />
                            </div>
                            <div className="h-16 w-16 bg-secondary rounded-full flex items-center justify-center border-2 border-primary/20 shrink-0">
                              <User className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <div className="flex-1 flex flex-col justify-center">
                              <h3 className="font-bold text-sm line-clamp-1" title={d.name}>{d.name}</h3>
                              <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                                <Truck className="h-3 w-3"/> {d.vehicle_type || '-'}
                              </p>
                              <p className="text-xs font-mono bg-secondary px-2 py-0.5 rounded mt-1 inline-block">{d.vehicle_plate || 'Sem Placa'}</p>
                            </div>
                            <div className="w-full pt-3 border-t border-border flex flex-wrap justify-between items-center gap-2 mt-auto">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7 text-xs px-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFromQueue(d.id);
                                }}
                              >
                                Remover
                              </Button>
                              <div className="flex flex-wrap items-center justify-end gap-2 flex-1">
                                <Button 
                                  variant="default" 
                                  size="sm" 
                                  className="h-7 text-xs px-3"
                                  disabled={loadingDriverId === d.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectDriver(d);
                                  }}
                                >
                                  {loadingDriverId === d.id ? 'Carregando...' : 'Carregar'}
                                </Button>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md whitespace-nowrap ${isFirst ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                  {isFirst ? 'Carregando' : 'Aguardando'}
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Em rota */}
        {activeTab === 'em_rota' && (
          <div className="space-y-6">
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-bold tracking-tight mb-1">Em Rota (Saiu para Entrega)</h2>
                <p className="text-muted-foreground text-sm">
                  {isNoneSelected ? 'Selecione uma base no menu superior para visualizar as entregas em rota.' : `Entregadores da base ${currentBase} que estão atualmente realizando entregas.`}
                </p>
              </div>
              
              <div className="relative mb-6">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-muted-foreground" />
                </div>
                <Input 
                  placeholder="Pesquisar entregador por nome..." 
                  className="pl-10 max-w-md bg-background"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {isNoneSelected ? (
                <div className="p-8 text-center bg-card border border-border rounded-xl text-muted-foreground text-sm">
                  Selecione uma base no menu superior para visualizar as entregas em rota.
                </div>
              ) : isLoadingDeliveries ? (
                <div className="p-12 text-center bg-card border border-border rounded-xl space-y-3">
                  <div className="h-8 w-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin mx-auto" />
                  <p className="text-sm font-medium text-muted-foreground animate-pulse">
                    Buscando entregadores em rota da base {currentBase}...
                  </p>
                </div>
              ) : loadError ? (
                <div className="p-6 bg-destructive/10 border border-destructive/20 rounded-xl text-center space-y-3">
                  <div className="flex items-center justify-center gap-2 text-destructive font-semibold text-sm">
                    <AlertCircle className="h-5 w-5" />
                    <span>{loadError}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => loadActiveDeliveries(selectedBase)} className="border-destructive/30 hover:bg-destructive/10 text-destructive cursor-pointer">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Tentar novamente
                  </Button>
                </div>
              ) : isNoneSelected ? (
                <div className="p-8 text-center bg-card border border-border rounded-xl text-muted-foreground text-sm">
                  Selecione uma base no menu superior para visualizar as entregas em rota.
                </div>
              ) : filteredActiveDeliveries.length === 0 ? (
                <div className="p-8 text-center bg-card border border-border rounded-xl text-muted-foreground text-sm">
                  Nenhum entregador da base {currentBase} em rota no momento.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredActiveDeliveries
                    .filter(load => (load.driverName || '').toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((load) => (
                    <Card 
                      key={load.id} 
                      className="bg-card border-border cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => setSelectedActiveDelivery(load)}
                    >
                      <div className="bg-primary/10 text-primary px-4 py-2 text-xs font-bold flex items-center gap-2 uppercase tracking-wider">
                        <Truck className="h-3 w-3" />
                        SAIU PARA ENTREGA
                      </div>
                      <CardContent className="p-4 flex flex-col space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-secondary rounded-full flex items-center justify-center border border-primary/20">
                            <User className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm line-clamp-1" title={load.driverName}>{load.driverName}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">{load.vehicle} • {load.plate}</p>
                          </div>
                        </div>
                        <div className="pt-3 border-t border-border flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">Mercadorias:</span>
                          <span className="font-bold text-foreground">{load.scannedItems?.length || 0} pacotes</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <Dialog open={!!selectedActiveDelivery} onOpenChange={(open) => !open && setSelectedActiveDelivery(null)}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Carga em Rota
              </DialogTitle>
            </DialogHeader>
            {selectedActiveDelivery && (
              <div className="py-4 space-y-4">
                <div className="flex items-center gap-4 bg-muted/20 p-3 rounded-lg border border-border">
                   <div className="h-12 w-12 bg-secondary rounded-full flex items-center justify-center border border-primary/20 shrink-0">
                     <User className="h-6 w-6 text-muted-foreground" />
                   </div>
                   <div>
                     <h3 className="font-bold">{selectedActiveDelivery.driverName}</h3>
                     <p className="text-sm text-muted-foreground">{selectedActiveDelivery.vehicle} • {selectedActiveDelivery.plate}</p>
                   </div>
                </div>
                
                {/* Pacotes por Empresa com controles +/− */}
                {(() => {
                  const companySummary: Record<string, number> = {};
                  selectedActiveDelivery.scannedItems?.forEach((item: any) => {
                    const name = item.company || 'Desconhecida';
                    companySummary[name] = (companySummary[name] || 0) + 1;
                  });
                  const entries = Object.entries(companySummary);
                  const total = entries.reduce((s, [, v]) => s + v, 0);
                  if (entries.length === 0) return (
                    <p className="text-sm text-center text-muted-foreground py-6">Nenhum pacote em rota.</p>
                  );
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          Pacotes por Empresa
                        </h4>
                        <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                          Total: {total}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {entries.map(([companyName, count]) => {
                          const isLoading = adjustingCompany === companyName;
                          const companyData = companies.find(c => c.name === companyName);
                          return (
                            <div
                              key={companyName}
                              className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-muted/30 border border-border"
                            >
                              <div className="flex items-center gap-2.5">
                                {companyData?.logo_url ? (
                                  <div className="h-8 w-8 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden shrink-0 p-0.5">
                                    <img src={companyData.logo_url} alt={companyName} className="max-w-full max-h-full object-contain" />
                                  </div>
                                ) : (
                                  <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                    <Building2 className="h-4 w-4 text-primary" />
                                  </div>
                                )}
                                <span className="text-sm font-medium">{companyName}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                  <>
                                    {/* Controles unitários */}
                                    <button
                                      disabled={isLoading || count <= 0}
                                      onClick={() => handleAdjustCompanyCount(selectedActiveDelivery.id, companyName, 'down')}
                                      className="h-7 w-7 rounded-lg border border-border bg-card flex items-center justify-center text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                      title="Marcar 1 como devolvida"
                                    >
                                      <ChevronDown className="h-4 w-4" />
                                    </button>
                                    <span className="text-sm font-bold tabular-nums w-8 text-center">
                                      {isLoading ? '…' : count}
                                    </span>
                                    <button
                                      disabled={isLoading}
                                      onClick={() => handleAdjustCompanyCount(selectedActiveDelivery.id, companyName, 'up')}
                                      className="h-7 w-7 rounded-lg border border-border bg-card flex items-center justify-center text-green-600 hover:bg-green-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                      title="Reverter 1 devolvida para em rota"
                                    >
                                      <ChevronUp className="h-4 w-4" />
                                    </button>

                                    {/* Separador */}
                                    <div className="w-px h-6 bg-border mx-1" />

                                    {/* Input de quantidade para devolução em lote */}
                                    <input
                                      type="number"
                                      min={1}
                                      max={count}
                                      placeholder="Qtd"
                                      disabled={isLoading || count <= 0}
                                      value={returnQty[companyName] ?? ''}
                                      onChange={(e) => setReturnQty(prev => ({ ...prev, [companyName]: e.target.value }))}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          const qty = parseInt(returnQty[companyName] || '0', 10);
                                          handleBulkReturn(selectedActiveDelivery.id, companyName, Math.min(qty, count));
                                        }
                                      }}
                                      className="w-14 h-7 text-center text-xs font-bold border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-destructive/50 disabled:opacity-30"
                                      title="Digite a quantidade devolvida e pressione Enter ou clique em ✓"
                                    />
                                    <button
                                      disabled={isLoading || count <= 0 || !returnQty[companyName]}
                                      onClick={() => {
                                        const qty = parseInt(returnQty[companyName] || '0', 10);
                                        handleBulkReturn(selectedActiveDelivery.id, companyName, Math.min(qty, count));
                                      }}
                                      className="h-7 px-2 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs font-bold hover:bg-destructive/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                      title="Confirmar devolução em lote"
                                    >
                                      ✓
                                    </button>
                                  </>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            <DialogFooter className="flex flex-col sm:flex-row items-center justify-between w-full gap-3 pt-4 border-t border-border mt-4">
              <Button variant="outline" onClick={() => setSelectedActiveDelivery(null)} className="w-full sm:w-auto">Fechar</Button>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Button 
                  variant="secondary"
                  className="w-full sm:w-auto gap-2 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200"
                  onClick={() => {
                    const realDriver = allDrivers.find(d => d.id === selectedActiveDelivery.id) || {
                      id: selectedActiveDelivery.id,
                      name: selectedActiveDelivery.driverName,
                      vehicle_type: selectedActiveDelivery.vehicle,
                      vehicle_plate: selectedActiveDelivery.plate,
                      base_location: 'Desconhecida',
                      bonus_per_delivery: 0
                    };
                    setSelectedActiveDelivery(null);
                    handleSelectDriver(realDriver as any);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Adicionar Entregas
                </Button>
                <Button
                  onClick={handleFinalizeDelivery}
                  disabled={finalizing || !selectedActiveDelivery?.scannedItems?.length}
                  className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {finalizing ? 'Finalizando...' : 'Finalizar Entregas'}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const totalScanned = Object.values(companyCounts).reduce((a: number, b: number) => a + b, 0);

  return (
    <div className={`h-full flex flex-col transition-colors duration-300 ${lastScanStatus === 'success' ? 'bg-success/5' : lastScanStatus === 'error' ? 'bg-destructive/10' : ''}`}>
      
      {/* Driver Info Header */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 bg-secondary rounded-full flex items-center justify-center border-2 border-primary/50">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-xl font-bold">{driver.name}</h3>
            <div className="flex items-center text-muted-foreground text-sm gap-3 mt-1">
              <span className="flex items-center gap-1"><Truck className="h-4 w-4"/> {driver.vehicle_type || '-'}</span>
              <span className="px-2 py-0.5 bg-secondary rounded-md text-xs font-mono">{driver.vehicle_plate || '-'}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground mb-1">Entregas adicionadas</div>
          <div className="text-4xl font-black text-primary">{totalScanned}</div>
        </div>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        
        {/* Companies Summary */}
        <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar flex-1 max-w-lg">
          {Object.entries(companyCounts).map(([companyName, count]) => {
            const company = companies.find(c => c.name === companyName);
            return (
              <Card key={companyName} className="bg-card border-border">
                <CardContent className="p-4 flex items-center gap-3">
                  {/* Logo da empresa */}
                  {company?.logo_url ? (
                    <div className="h-10 w-10 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden shrink-0 p-0.5">
                      <img src={company.logo_url} alt={companyName} className="max-w-full max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="h-10 w-10 rounded-lg border border-border bg-muted/30 flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <span className="font-medium flex-1 truncate">{companyName}</span>
                  <div className="w-24 shrink-0">
                    <Input
                      type="number"
                      min="0"
                      value={count === 0 ? '' : count}
                      placeholder="0"
                      className="text-right text-xl font-bold h-12"
                      onChange={(e) => {
                        const val = e.target.value === '' ? '0' : e.target.value;
                        handleManualCountChange(companyName, val);
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <div className="mt-auto pt-4 flex gap-3">
            <Button variant="outline" className="h-14 px-6 text-base font-semibold" onClick={handleCancelLoading}>
              Voltar
            </Button>
            <Button 
              className="flex-1 h-14 text-lg font-bold" 
              onClick={handleFinishLoading} 
              disabled={totalScanned === 0 || isSaving}
            >
              {isSaving ? 'Finalizando...' : 'Finalizar Carregamento'}
            </Button>
          </div>
        </div>

        {/* Já Carregados (View Only) */}
        {(() => {
          const alreadyLoaded = activeDeliveries.find(ad => ad.id === driver.id);
          if (!alreadyLoaded || !alreadyLoaded.scannedItems || alreadyLoaded.scannedItems.length === 0) return null;
          
          const summary: Record<string, number> = {};
          alreadyLoaded.scannedItems.forEach((item: any) => {
            const name = item.company || 'Desconhecida';
            summary[name] = (summary[name] || 0) + 1;
          });
          const entries = Object.entries(summary).sort((a, b) => b[1] - a[1]);
          const totalAlreadyLoaded = entries.reduce((s, [, v]) => s + v, 0);
          
          return (
            <div className="flex-1 hidden md:flex flex-col bg-muted/10 border border-border rounded-xl p-6 shadow-inner relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <Truck className="w-48 h-48" />
              </div>
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-6 shrink-0">
                  <h3 className="text-xl font-bold flex items-center gap-2 text-muted-foreground">
                    <Truck className="h-5 w-5" />
                    Carga em Rota (Já Carregada)
                  </h3>
                  <span className="bg-primary/10 text-primary font-bold px-3 py-1 rounded-full text-sm">
                    {totalAlreadyLoaded} pacotes
                  </span>
                </div>
                <div className="space-y-3 overflow-y-auto custom-scrollbar pr-2 pb-4">
                  {entries.map(([comp, count]) => {
                    const company = companies.find(c => c.name === comp);
                    return (
                      <div key={comp} className="flex items-center justify-between p-4 rounded-xl bg-card border border-border shadow-sm opacity-80">
                        <div className="flex items-center gap-3">
                          {company?.logo_url ? (
                            <div className="h-8 w-8 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden shrink-0 p-0.5">
                              <img src={company.logo_url} alt={comp} className="max-w-full max-h-full object-contain" />
                            </div>
                          ) : (
                            <div className="h-8 w-8 rounded-lg border border-border bg-muted flex items-center justify-center shrink-0">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <span className="font-medium text-muted-foreground">{comp}</span>
                        </div>
                        <span className="font-bold text-2xl tabular-nums text-muted-foreground">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
