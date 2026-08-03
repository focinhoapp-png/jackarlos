import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Receipt, TrendingDown, AlertTriangle, Search,
  Trash2, Edit, X, Calendar, Clock, DollarSign, UserCircle, FileText, Filter
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/src/components/ui/dialog';
import { supabase } from '@/src/lib/supabase';

interface Despesa {
  id: string;
  tipo: 'FIXA' | 'VARIAVEL';
  descricao: string;
  valor: number;
  data: string;
  horario: string;
  observacao: string | null;
  criado_por: string | null;
  criado_por_nome: string | null;
  created_at: string;
}

interface FormData {
  tipo: 'FIXA' | 'VARIAVEL';
  descricao: string;
  valor: string;
  data: string;
  horario: string;
  observacao: string;
}

const emptyForm: FormData = {
  tipo: 'FIXA',
  descricao: '',
  valor: '',
  data: new Date().toISOString().split('T')[0],
  horario: new Date().toTimeString().slice(0, 5),
  observacao: '',
};

export function Despesas() {
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState<'TODOS' | 'FIXA' | 'VARIAVEL'>('TODOS');
  const [timeFilter, setTimeFilter] = useState<'hoje' | 'semana' | 'mes'>('mes');
  const [currentAdmin, setCurrentAdmin] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Load current admin
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const userId = data.session?.user?.id;
      if (userId) {
        const { data: userData } = await supabase
          .from('users')
          .select('id, name, role')
          .eq('id', userId)
          .single();
        if (userData) {
          setCurrentAdmin({ id: userData.id, name: userData.name });
        }
      }
    });
  }, []);

  const fetchDespesas = useCallback(async () => {
    setIsLoading(true);
    const now = new Date();
    let startDate: Date;

    if (timeFilter === 'hoje') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (timeFilter === 'semana') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const { data, error } = await supabase
      .from('despesas')
      .select('*')
      .gte('data', startDate.toISOString().split('T')[0])
      .order('data', { ascending: false })
      .order('horario', { ascending: false });

    if (!error && data) {
      setDespesas(data as Despesa[]);
    }
    setIsLoading(false);
  }, [timeFilter]);

  useEffect(() => {
    fetchDespesas();
  }, [fetchDespesas]);

  const openCreate = () => {
    setEditingId(null);
    setFormData({
      ...emptyForm,
      data: new Date().toISOString().split('T')[0],
      horario: new Date().toTimeString().slice(0, 5),
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEdit = (despesa: Despesa) => {
    setEditingId(despesa.id);
    setFormData({
      tipo: despesa.tipo,
      descricao: despesa.descricao,
      valor: despesa.valor.toString().replace('.', ','),
      data: despesa.data,
      horario: despesa.horario.slice(0, 5),
      observacao: despesa.observacao || '',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.descricao.trim()) {
      setFormError('Descrição é obrigatória.');
      return;
    }
    const valorNum = parseFloat(formData.valor.replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) {
      setFormError('Informe um valor válido maior que zero.');
      return;
    }
    if (!formData.data) {
      setFormError('Informe a data.');
      return;
    }
    if (!formData.horario) {
      setFormError('Informe o horário.');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const payload = {
      tipo: formData.tipo,
      descricao: formData.descricao.trim(),
      valor: valorNum,
      data: formData.data,
      horario: formData.horario + ':00',
      observacao: formData.observacao.trim() || null,
      criado_por: currentAdmin?.id || null,
      criado_por_nome: currentAdmin?.name || null,
    };

    if (editingId) {
      const { error } = await supabase.from('despesas').update(payload).eq('id', editingId);
      if (error) { setFormError('Erro ao atualizar despesa.'); setIsSaving(false); return; }
    } else {
      const { error } = await supabase.from('despesas').insert([payload]);
      if (error) { setFormError('Erro ao cadastrar despesa.'); setIsSaving(false); return; }
    }

    setIsSaving(false);
    setIsModalOpen(false);
    fetchDespesas();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('despesas').delete().eq('id', id);
    setDeleteConfirmId(null);
    fetchDespesas();
  };

  const filtered = despesas.filter(d => {
    const matchSearch =
      d.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.criado_por_nome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.observacao || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchTipo = filterTipo === 'TODOS' || d.tipo === filterTipo;
    return matchSearch && matchTipo;
  });

  const totalFixas = despesas.filter(d => d.tipo === 'FIXA').reduce((a, b) => a + b.valor, 0);
  const totalVariaveis = despesas.filter(d => d.tipo === 'VARIAVEL').reduce((a, b) => a + b.valor, 0);
  const totalGeral = totalFixas + totalVariaveis;

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatDate = (d: string) => {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            Despesas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie despesas fixas e variáveis da operação
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Time filter */}
          <div className="bg-card border border-border rounded-lg p-1 flex">
            {(['hoje', 'semana', 'mes'] as const).map(f => (
              <button
                key={f}
                onClick={() => setTimeFilter(f)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  timeFilter === f
                    ? 'bg-primary text-primary-foreground shadow'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f === 'hoje' ? 'Hoje' : f === 'semana' ? 'Semanal' : 'Mensal'}
              </button>
            ))}
          </div>

          <Button onClick={openCreate} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Adicionar Despesa
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Despesas Fixas
            </CardTitle>
            <TrendingDown className="h-5 w-5 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">{formatCurrency(totalFixas)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {despesas.filter(d => d.tipo === 'FIXA').length} lançamentos no período
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Despesas Variáveis
            </CardTitle>
            <AlertTriangle className="h-5 w-5 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-400">{formatCurrency(totalVariaveis)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {despesas.filter(d => d.tipo === 'VARIAVEL').length} lançamentos no período
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Despesas
            </CardTitle>
            <DollarSign className="h-5 w-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatCurrency(totalGeral)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {despesas.length} lançamentos no período
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table Card */}
      <Card className="bg-card shadow-sm border-border">
        <CardHeader className="border-b border-border bg-muted/20 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold">Lançamentos</CardTitle>
              <CardDescription>Todas as despesas registradas no período selecionado.</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Tipo filter */}
              <div className="flex bg-muted/30 border border-border rounded-lg p-0.5">
                {(['TODOS', 'FIXA', 'VARIAVEL'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setFilterTipo(t)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      filterTipo === t
                        ? 'bg-primary text-primary-foreground shadow'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t === 'TODOS' ? 'Todos' : t === 'FIXA' ? 'Fixas' : 'Variáveis'}
                  </button>
                ))}
              </div>
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Buscar despesa..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9 w-52 h-9 text-sm"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-muted-foreground">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Carregando despesas...</span>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma despesa encontrada.</p>
              <p className="text-xs mt-1 opacity-70">Ajuste os filtros ou adicione uma nova despesa.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[850px]">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/10 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Tipo</th>
                    <th className="px-6 py-4 font-medium">Descrição</th>
                    <th className="px-6 py-4 font-medium">Data / Horário</th>
                    <th className="px-6 py-4 font-medium text-right">Valor</th>
                    <th className="px-6 py-4 font-medium">Observação</th>
                    <th className="px-6 py-4 font-medium">Cadastrado por</th>
                    <th className="px-6 py-4 font-medium text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(despesa => (
                    <tr
                      key={despesa.id}
                      className="border-b border-border/50 hover:bg-muted/10 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            despesa.tipo === 'FIXA'
                              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                              : 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
                          }`}
                        >
                          {despesa.tipo === 'FIXA' ? (
                            <TrendingDown className="h-3 w-3" />
                          ) : (
                            <AlertTriangle className="h-3 w-3" />
                          )}
                          {despesa.tipo === 'FIXA' ? 'Fixa' : 'Variável'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-foreground">
                        {despesa.descricao}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        <div className="flex flex-col">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(despesa.data)}
                          </span>
                          <span className="flex items-center gap-1 text-xs opacity-70 mt-0.5">
                            <Clock className="h-3 w-3" />
                            {despesa.horario.slice(0, 5)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-destructive">
                        {formatCurrency(despesa.valor)}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground max-w-[180px] truncate">
                        {despesa.observacao ? (
                          <span title={despesa.observacao} className="flex items-center gap-1">
                            <FileText className="h-3 w-3 shrink-0" />
                            <span className="truncate">{despesa.observacao}</span>
                          </span>
                        ) : (
                          <span className="opacity-40">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <UserCircle className="h-4 w-4 text-primary" />
                          </div>
                          <span className="text-sm font-medium text-foreground">
                            {despesa.criado_por_nome || 'Admin'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEdit(despesa)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(despesa.id)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              {editingId ? 'Editar Despesa' : 'Nova Despesa'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Tipo */}
            <div className="space-y-1.5">
              <Label>Tipo de Despesa</Label>
              <div className="flex gap-2">
                {(['FIXA', 'VARIAVEL'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setFormData(prev => ({ ...prev, tipo: t }))}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-all ${
                      formData.tipo === t
                        ? t === 'FIXA'
                          ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                          : 'bg-orange-500/20 border-orange-500 text-orange-400'
                        : 'border-border text-muted-foreground hover:border-foreground/30'
                    }`}
                  >
                    {t === 'FIXA' ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <TrendingDown className="h-4 w-4" /> Fixa
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-1.5">
                        <AlertTriangle className="h-4 w-4" /> Variável
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label htmlFor="descricao">Descrição *</Label>
              <Input
                id="descricao"
                placeholder="Ex: Aluguel do galpão, combustível, manutenção..."
                value={formData.descricao}
                onChange={e => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
              />
            </div>

            {/* Data e Horário */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="data" className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Data *
                </Label>
                <Input
                  id="data"
                  type="date"
                  value={formData.data}
                  onChange={e => setFormData(prev => ({ ...prev, data: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="horario" className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Horário *
                </Label>
                <Input
                  id="horario"
                  type="time"
                  value={formData.horario}
                  onChange={e => setFormData(prev => ({ ...prev, horario: e.target.value }))}
                />
              </div>
            </div>

            {/* Valor */}
            <div className="space-y-1.5">
              <Label htmlFor="valor" className="flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" /> Valor (R$) *
              </Label>
              <Input
                id="valor"
                placeholder="0,00"
                value={formData.valor}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9,\.]/g, '');
                  setFormData(prev => ({ ...prev, valor: raw }));
                }}
              />
            </div>

            {/* Observação */}
            <div className="space-y-1.5">
              <Label htmlFor="observacao" className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" /> Observação
              </Label>
              <textarea
                id="observacao"
                rows={3}
                placeholder="Informações adicionais sobre essa despesa..."
                value={formData.observacao}
                onChange={e => setFormData(prev => ({ ...prev, observacao: e.target.value }))}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
              />
            </div>

            {/* Admin info */}
            {currentAdmin && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/50">
                <UserCircle className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs text-muted-foreground">
                  Será cadastrado por <span className="font-semibold text-foreground">{currentAdmin.name}</span>
                </span>
              </div>
            )}

            {/* Error */}
            {formError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                <X className="h-4 w-4 shrink-0" />
                {formError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving ? (
                <>
                  <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Receipt className="h-4 w-4" />
                  {editingId ? 'Salvar Alterações' : 'Cadastrar Despesa'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Excluir Despesa
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Tem certeza que deseja excluir esta despesa? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
