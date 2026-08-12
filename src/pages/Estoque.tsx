import React, { useState, useEffect } from 'react';
import { PackageSearch, AlertCircle, CheckCircle, Package, Calendar, Trash2, RotateCcw, ShieldAlert, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { supabase } from '@/src/lib/supabase';

export function Estoque() {
  const [estoque, setEstoque] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);
  const [deletingPackage, setDeletingPackage] = useState<string | null>(null);
  const [editingPackage, setEditingPackage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'group' | 'package'; id: string; label: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    checkRole();
    fetchEstoque();
  }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const checkRole = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (userId) {
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();
      if (userData?.role === 'ADMIN') setIsAdmin(true);
    }
  };

  const fetchEstoque = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('packages')
      .select(`
        id,
        barcode,
        status,
        scanned_at,
        driver_id,
        base_location,
        drivers ( name, vehicle_plate ),
        companies ( name ),
        users ( name )
      `)
      .in('status', ['ENTREGUE', 'DEVOLVIDA'])
      .order('scanned_at', { ascending: false }).limit(999999);

    if (error) {
      console.error('Error fetching estoque:', error);
    } else if (data) {
      const grouped: Record<string, any> = {};

      data.forEach((pkg: any) => {
        const dateStr = new Date(pkg.scanned_at).toLocaleDateString('pt-BR');
        const groupId = `${pkg.driver_id}-${dateStr}`;

        if (!grouped[groupId]) {
          grouped[groupId] = {
            id: groupId,
            driverId: pkg.driver_id,
            driverName: pkg.drivers?.name || 'Desconhecido',
            plate: pkg.drivers?.vehicle_plate || 'Sem Placa',
            conferente: pkg.users?.name || 'Desconhecido',
            endTime: pkg.scanned_at,
            items: []
          };
        }

        grouped[groupId].items.push({
          id: pkg.id,
          code: pkg.barcode,
          company: pkg.companies?.name,
          time: new Date(pkg.scanned_at).toLocaleTimeString('pt-BR'),
          rota: pkg.base_location || '-',
          finalStatus: pkg.status === 'ENTREGUE' ? 'Entregue' : 'Devolvida',
          rawStatus: pkg.status,
        });
      });

      setEstoque(Object.values(grouped));
    }
    setIsLoading(false);
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Deleta todos os pacotes finalizados de um grupo (driver+data) usando driver_id + data
  const handleDeleteGroup = async (group: any) => {
    setDeletingGroup(group.id);

    // Calcula o intervalo do dia com base nos itens do grupo
    const dateStr = new Date(group.endTime).toLocaleDateString('pt-BR');
    const [day, month, year] = dateStr.split('/');
    const startOfDay = new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0).toISOString();
    const endOfDay   = new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59).toISOString();

    const { error } = await supabase
      .from('packages')
      .delete()
      .eq('driver_id', group.driverId)
      .in('status', ['ENTREGUE', 'DEVOLVIDA'])
      .gte('scanned_at', startOfDay)
      .lte('scanned_at', endOfDay);

    if (error) {
      console.error('Erro detalhado ao deletar grupo:', error);
      showToast(`Erro ao deletar: ${error.message} (${(error as any).code || ''})`, 'error');
    } else {
      showToast(`✅ ${group.items.length} entrega(s) de "${group.driverName}" removidas!`);
      await fetchEstoque();
    }
    setDeletingGroup(null);
    setConfirmDelete(null);
  };

  // Deleta um pacote individual
  const handleDeletePackage = async (pkgId: string, code: string, _groupId: string) => {
    setDeletingPackage(pkgId);

    const { error } = await supabase
      .from('packages')
      .delete()
      .eq('id', pkgId);

    if (error) {
      console.error('Erro detalhado ao deletar pacote:', error);
      showToast(`Erro ao deletar: ${error.message} (${(error as any).code || ''})`, 'error');
    } else {
      showToast(`✅ Pacote ${code} removido!`);
      await fetchEstoque();
    }
    setDeletingPackage(null);
    setConfirmDelete(null);
  };

  // Edita o status de um pacote individual
  const handleEditStatus = async (pkgId: string, currentStatus: string) => {
    setEditingPackage(pkgId);

    // Alterna entre ENTREGUE → DEVOLVIDA → EM_ROTA
    const next =
      currentStatus === 'ENTREGUE' ? 'DEVOLVIDA' :
      currentStatus === 'DEVOLVIDA' ? 'EM_ROTA' : 'ENTREGUE';

    const { error } = await supabase
      .from('packages')
      .update({ status: next, finalized_at: next === 'EM_ROTA' ? null : new Date().toISOString() })
      .eq('id', pkgId);

    if (error) {
      showToast(`Erro ao editar: ${error.message}`, 'error');
    } else {
      const labels: Record<string, string> = { ENTREGUE: 'Entregue', DEVOLVIDA: 'Devolvida', EM_ROTA: 'Em Rota' };
      showToast(`✅ Status alterado para "${labels[next]}"`);
      await fetchEstoque();
    }
    setEditingPackage(null);
  };

  return (
    <div className="space-y-6 relative">

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border text-sm font-medium transition-all animate-slide-up ${
          toast.type === 'success'
            ? 'bg-card border-green-500/30 text-foreground'
            : 'bg-card border-destructive/30 text-destructive'
        }`}>
          {toast.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
          )}
          {toast.message}
        </div>
      )}

      {/* Modal de confirmação */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">Confirmar exclusão</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{confirmDelete.label}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground bg-destructive/5 border border-destructive/20 rounded-lg px-4 py-3">
              Esta ação é <strong className="text-destructive">irreversível</strong>. Os registros serão permanentemente removidos do banco de dados.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (confirmDelete.type === 'group') {
                    const group = estoque.find(g => g.id === confirmDelete.id);
                    if (group) handleDeleteGroup(group);
                  } else {
                    const [pkgId, code, groupId] = confirmDelete.id.split('||');
                    handleDeletePackage(pkgId, code, groupId);
                  }
                }}
                disabled={!!deletingGroup || !!deletingPackage}
                className="px-4 py-2 text-sm rounded-lg bg-destructive text-white hover:bg-destructive/90 transition-colors font-medium flex items-center gap-2 disabled:opacity-60"
              >
                {(deletingGroup || deletingPackage) && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmar exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estoque e Devoluções</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Conferência de mercadorias entregues e devolvidas pelos entregadores.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold">
            <ShieldAlert className="w-3.5 h-3.5" />
            Modo Admin — edição habilitada
          </div>
        )}
      </div>

      {isLoading ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Loader2 className="h-10 w-10 mb-4 opacity-50 animate-spin" />
            <h3 className="text-xl font-bold text-foreground">Carregando estoque...</h3>
          </CardContent>
        </Card>
      ) : estoque.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <PackageSearch className="h-16 w-16 mb-4 opacity-50" />
            <h3 className="text-xl font-bold text-foreground">Nenhuma carga finalizada</h3>
            <p className="max-w-sm mt-2">
              As cargas finalizadas pelos entregadores aparecerão aqui para conferência do estoque e devoluções.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {estoque.map((load) => {
            const entregues = load.items.filter((i: any) => i.finalStatus === 'Entregue').length;
            const devolvidas = load.items.filter((i: any) => i.finalStatus === 'Devolvida').length;
            const isExpanded = expandedGroups[load.id] !== false; // expanded by default

            return (
              <Card key={load.id} className="bg-card border-border shadow-sm overflow-hidden">
                <CardHeader className="bg-muted/20 border-b border-border pb-4">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                        Carga / Rota
                        <span className="text-sm font-normal text-muted-foreground bg-background px-2 py-1 rounded border border-border">
                          {load.driverName} ({load.plate})
                        </span>
                      </CardTitle>
                      <div className="text-sm text-muted-foreground mt-2 flex items-center gap-4 flex-wrap">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4" />
                          Data: {new Date(load.endTime).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <CheckCircle className="h-4 w-4" />
                          Finalizado por: <span className="font-medium text-foreground">{load.conferente}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      {/* Contadores */}
                      <div className="flex gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-success">{entregues}</div>
                          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Entregues</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-destructive">{devolvidas}</div>
                          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Devolvidas</div>
                        </div>
                      </div>

                      {/* Ações admin */}
                      {isAdmin && (
                        <button
                          onClick={() => setConfirmDelete({
                            type: 'group',
                            id: load.id,
                            label: `Apagar todas as ${load.items.length} entrega(s) finalizada(s) de "${load.driverName}" do dia ${new Date(load.endTime).toLocaleDateString('pt-BR')}`
                          })}
                          disabled={deletingGroup === load.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-destructive/30 text-destructive bg-destructive/5 hover:bg-destructive/15 transition-colors text-xs font-semibold disabled:opacity-60"
                          title="Limpar todo o histórico deste entregador nesta data"
                        >
                          {deletingGroup === load.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                          Limpar tudo
                        </button>
                      )}

                      {/* Toggle expandir */}
                      <button
                        onClick={() => toggleGroup(load.id)}
                        className="p-2 rounded-lg border border-border text-muted-foreground hover:bg-accent transition-colors"
                        title={isExpanded ? 'Recolher' : 'Expandir'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-muted/10 border-b border-border">
                          <tr>
                            <th className="px-6 py-3 font-medium">Código</th>
                            <th className="px-6 py-3 font-medium">Empresa</th>
                            <th className="px-6 py-3 font-medium">Bipado em</th>
                            <th className="px-6 py-3 font-medium">Rota</th>
                            <th className="px-6 py-3 font-medium text-center">Status Final</th>
                            {isAdmin && <th className="px-6 py-3 font-medium text-center">Ações</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {load.items.map((item: any, idx: number) => (
                            <tr key={idx} className="border-b border-border/50 hover:bg-muted/5 transition-colors last:border-0">
                              <td className="px-6 py-3">
                                <div className="flex items-center gap-2 font-mono font-medium">
                                  <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <span className="break-all">{item.code}</span>
                                </div>
                              </td>
                              <td className="px-6 py-3">{item.company}</td>
                              <td className="px-6 py-3 text-muted-foreground">{item.time}</td>
                              <td className="px-6 py-3">{item.rota}</td>
                              <td className="px-6 py-3 text-center">
                                {item.finalStatus === 'Entregue' ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-success/20 text-success border border-success/20">
                                    <CheckCircle className="w-3 h-3" /> Entregue
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-destructive/20 text-destructive border border-destructive/20">
                                    <AlertCircle className="w-3 h-3" /> Devolvida
                                  </span>
                                )}
                              </td>
                              {isAdmin && (
                                <td className="px-6 py-3">
                                  <div className="flex items-center justify-center gap-2">
                                    {/* Botão alterar status */}
                                    <button
                                      onClick={() => handleEditStatus(item.id, item.rawStatus)}
                                      disabled={editingPackage === item.id}
                                      title="Alternar status: Entregue → Devolvida → Em Rota"
                                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground bg-muted/10 hover:bg-accent hover:text-accent-foreground transition-colors text-xs font-medium disabled:opacity-60"
                                    >
                                      {editingPackage === item.id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <RotateCcw className="w-3.5 h-3.5" />
                                      )}
                                      Editar
                                    </button>

                                    {/* Botão deletar individual */}
                                    <button
                                      onClick={() => setConfirmDelete({
                                        type: 'package',
                                        id: `${item.id}||${item.code}||${load.id}`,
                                        label: `Apagar o pacote "${item.code}" permanentemente.`
                                      })}
                                      disabled={deletingPackage === item.id}
                                      title="Deletar este pacote"
                                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-destructive/30 text-destructive bg-destructive/5 hover:bg-destructive/15 transition-colors text-xs font-medium disabled:opacity-60"
                                    >
                                      {deletingPackage === item.id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="w-3.5 h-3.5" />
                                      )}
                                      Deletar
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
