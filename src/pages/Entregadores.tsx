import React, { useRef, useState, useEffect } from "react";
import { Users, Plus, Search, Edit, Trash2, CheckCircle, XCircle, Truck, Camera, Eye, EyeOff, AlertCircle, KeyRound } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/src/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { supabase } from '@/src/lib/supabase';
import { logAction } from '@/src/lib/audit';
import { adminCreateUser, adminUpdateUser, adminDeleteUser } from '@/src/lib/adminApi';

// SEGURANÇA: SERVICE_ROLE_KEY foi removida do frontend.
// Operações de Auth (criar/editar/deletar usuário) são feitas via Edge Function segura.

interface Entregador {
  id: string;
  user_id?: string;
  name: string;
  cpf: string;
  phone: string;
  vehicle_type: string;
  vehicle_plate: string;
  bonus_per_delivery: number;
  base_location: string;
  route?: string;
  status: boolean;
  photo_url?: string;
  username?: string;
  // plain_password REMOVIDO — senhas em texto puro são inseguras
}

export function Entregadores() {
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dbBases, setDbBases] = useState<{id: string, name: string}[]>([]);
  const [dbRoutes, setDbRoutes] = useState<{id: string, name: string}[]>([]);
  const [dbCompanies, setDbCompanies] = useState<{id: string, name: string, color_hex: string, logo_url?: string}[]>([]);

  // Bônus por empresa: { [company_id]: valor_string }
  const [companyBonuses, setCompanyBonuses] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    name: '',
    cpf: '',
    phone: '',
    vehicleType: 'Moto',
    vehiclePlate: '',
    base: '',
    route: '',
    status: 'Ativo',
    photo: '',
    username: '',
    password: ''
  });

  useEffect(() => {
    fetchEntregadores();
    fetchOptions();
  }, []);

  const fetchOptions = async () => {
    const [basesRes, routesRes, companiesRes] = await Promise.all([
      supabase.from('bases').select('id, name').eq('status', true).order('name'),
      supabase.from('routes').select('id, name').eq('status', true).order('name'),
      supabase.from('companies').select('id, name, color_hex, logo_url').eq('status', true).order('name')
    ]);
    if (basesRes.data) setDbBases(basesRes.data);
    if (routesRes.data) setDbRoutes(routesRes.data);
    if (companiesRes.data) setDbCompanies(companiesRes.data);
  };

  const fetchEntregadores = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('drivers')
      .select(`
        *,
        users (
          id,
          email
        )
      `)
      .order('name');

    if (!error && data) {
      setEntregadores(data.map((d: any) => ({
        ...d,
        username: d.users?.email ? d.users.email.split('@')[0] : '',
      })));
    }
    setIsLoading(false);
  };

  const filteredEntregadores = entregadores.filter(ent =>
    ent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (ent.cpf && ent.cpf.includes(searchTerm)) ||
    (ent.vehicle_plate && ent.vehicle_plate.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const openNewModal = () => {
    setEditingId(null);
    setEditingUserId(null);
    setSaveError(null);
    setShowPassword(false);
    setCompanyBonuses({});
    setFormData({
      name: '', cpf: '', phone: '', vehicleType: 'Moto', vehiclePlate: '',
      base: dbBases.length > 0 ? dbBases[0].name : '',
      route: dbRoutes.length > 0 ? dbRoutes[0].name : '',
      status: 'Ativo', photo: '', username: '', password: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = async (ent: Entregador) => {
    setEditingId(ent.id);
    setEditingUserId(ent.user_id || null);
    setSaveError(null);
    setShowPassword(false);
    setFormData({
      name: ent.name,
      cpf: ent.cpf || '',
      phone: ent.phone || '',
      vehicleType: ent.vehicle_type || 'Moto',
      vehiclePlate: ent.vehicle_plate || '',
      base: ent.base_location || (dbBases.length > 0 ? dbBases[0].name : ''),
      route: ent.route || (dbRoutes.length > 0 ? dbRoutes[0].name : ''),
      status: ent.status ? 'Ativo' : 'Inativo',
      photo: ent.photo_url || '',
      username: ent.username || '',
      password: '' // Campo vazio ao editar — preenchido apenas se quiser alterar
    });

    // Carregar bônus por empresa existentes
    const { data: bonusData } = await supabase
      .from('driver_company_bonuses')
      .select('company_id, bonus_amount')
      .eq('driver_id', ent.id);

    const bonusMap: Record<string, string> = {};
    if (bonusData) {
      bonusData.forEach((b: any) => {
        bonusMap[b.company_id] = b.bonus_amount.toString();
      });
    }
    setCompanyBonuses(bonusMap);

    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm('Tem certeza que deseja excluir este entregador?')) return;

    const ent = entregadores.find(e => e.id === id);

    // Se o entregador tem user_id, deleta do Auth via edge function
    if (ent?.user_id) {
      const { error } = await adminDeleteUser({ userId: ent.user_id });
      if (error) {
        alert('Erro ao excluir acesso do sistema: ' + error);
        return;
      }
    }

    // Deleta o registro de driver
    const { error: driverErr } = await supabase.from('drivers').delete().eq('id', id);
    if (driverErr) {
      alert('Erro ao excluir entregador: ' + driverErr.message);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) await logAction(user.email, 'DELETOU', 'ENTREGADOR', name);
    fetchEntregadores();
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 300;
        let { width, height } = img;
        if (width > height) { if (width > maxSize) { height = (height * maxSize) / width; width = maxSize; } }
        else { if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; } }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        setFormData(prev => ({ ...prev, photo: canvas.toDataURL('image/jpeg', 0.8) }));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const saveCompanyBonuses = async (driverId: string) => {
    // Deleta todos os bônus anteriores deste entregador
    await supabase.from('driver_company_bonuses').delete().eq('driver_id', driverId);

    // Insere os novos bônus com valor > 0
    const toInsert = (Object.entries(companyBonuses) as [string, string][])
      .filter(([, val]) => parseFloat(val) > 0)
      .map(([company_id, val]) => ({
        driver_id: driverId,
        company_id,
        bonus_amount: parseFloat(val)
      }));

    if (toInsert.length > 0) {
      await supabase.from('driver_company_bonuses').insert(toInsert);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const adminEmail = user?.email || 'admin@sistema.com';

      const driverData = {
        name: formData.name,
        cpf: formData.cpf || null,
        phone: formData.phone || null,
        vehicle_type: formData.vehicleType,
        vehicle_plate: formData.vehiclePlate || null,
        base_location: formData.base,
        route: formData.route,
        status: formData.status === 'Ativo',
        photo_url: formData.photo || null
      };

      if (editingId) {
        // ===== EDITAR =====
        await supabase.from('drivers').update(driverData).eq('id', editingId);

        // Salvar bônus por empresa
        await saveCompanyBonuses(editingId);

        // Atualizar usuário vinculado se existir
        if (editingUserId && formData.username) {
          const email = `${formData.username.trim()}@jackarlo.com`;
          const currentEnt = entregadores.find(e => e.id === editingId);

          const updates: { email?: string; password?: string } = {};

          // Atualiza email se mudou
          if (currentEnt?.username !== formData.username.trim()) {
            updates.email = email;
          }

          // Atualiza senha se foi preenchida
          if (formData.password) {
            if (formData.password.length < 6) throw new Error('Senha deve ter pelo menos 6 caracteres.');
            updates.password = formData.password;
          }

          if (Object.keys(updates).length > 0) {
            const { error: updateErr } = await adminUpdateUser({ userId: editingUserId, ...updates });
            if (updateErr) throw new Error(updateErr);
          }

          // Atualiza public.users (sem plain_password)
          await supabase.from('users').update({
            name: formData.name,
            email,
            avatar_url: formData.photo || null,
          }).eq('id', editingUserId);
        }
        await logAction(adminEmail, 'EDITOU', 'ENTREGADOR', formData.name);

      } else {
        // ===== CRIAR =====
        if (!formData.username) throw new Error('Login é obrigatório.');
        if (!formData.password) throw new Error('Senha é obrigatória.');
        if (formData.password.length < 6) throw new Error('Senha deve ter pelo menos 6 caracteres.');

        const email = `${formData.username.trim()}@jackarlo.com`;

        // 1. Cria usuário no Auth via Edge Function (seguro)
        const { data: createResult, error: createErr } = await adminCreateUser({
          email,
          password: formData.password,
          user_metadata: { full_name: formData.name, name: formData.name, role: 'ENTREGADOR' }
        });

        if (createErr || !createResult?.user?.id) {
          throw new Error(createErr || 'Erro ao criar acesso.');
        }

        const userId = createResult.user.id;

        // 2. Insere em public.users (sem plain_password)
        await supabase.from('users').upsert({
          id: userId,
          email,
          name: formData.name,
          role: 'ENTREGADOR',
          status: true,
          avatar_url: formData.photo || null,
        }, { onConflict: 'id' });

        // 3. Insere em drivers com user_id vinculado
        const { data: newDriver, error: driverErr } = await supabase
          .from('drivers')
          .insert([{ ...driverData, user_id: userId }])
          .select('id')
          .single();
        if (driverErr) throw new Error(driverErr.message);

        // 4. Salvar bônus por empresa
        if (newDriver?.id) {
          await saveCompanyBonuses(newDriver.id);
        }

        await logAction(adminEmail, 'CRIOU', 'ENTREGADOR', formData.name);
      }

      fetchEntregadores();
      setIsModalOpen(false);
    } catch (err: any) {
      let msg = err.message || 'Erro desconhecido.';
      if (msg.includes('A user with this email address has already been registered') || msg.includes('User already registered')) {
        msg = 'Um usuário com este login já foi cadastrado.';
      } else if (msg.includes('Password should be at least')) {
        msg = 'A senha deve ter pelo menos 6 caracteres.';
      } else if (msg.includes('Unable to validate email address: invalid format')) {
        msg = 'Não foi possível validar o login, formato inválido.';
      }
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Entregadores</h1>
        <Button onClick={openNewModal} className="gap-2 shadow-lg shadow-primary/20">
          <Plus className="h-4 w-4" />
          Novo Entregador
        </Button>
      </div>

      <Card className="bg-card border-border shadow-sm">
        <CardHeader className="border-b border-border p-4 bg-muted/20">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, CPF ou placa..." className="pl-9 bg-background" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="overflow-x-auto w-full"><table className="w-full text-sm text-left min-w-[900px]">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">Entregador</th>
                  <th className="px-6 py-4 font-medium">Login</th>
                  <th className="px-6 py-4 font-medium">Rota</th>
                  <th className="px-6 py-4 font-medium">Veículo</th>
                  <th className="px-6 py-4 font-medium">Base</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">Carregando entregadores...</td></tr>
                ) : filteredEntregadores.map((ent) => (
                  <tr key={ent.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0 overflow-hidden">
                          {ent.photo_url ? (
                            <img src={ent.photo_url} alt={ent.name} className="w-full h-full object-cover" />
                          ) : (
                            <Users className="w-5 h-5 text-primary" />
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-foreground">{ent.name}</div>
                          <div className="text-xs text-muted-foreground">{ent.phone || '-'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs font-mono">
                      {ent.username ? `@${ent.username}` : <span className="italic">Sem login</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-foreground">{ent.route || '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-foreground">{ent.vehicle_plate || 'Sem Placa'}</div>
                          <div className="text-xs text-muted-foreground">{ent.vehicle_type || '-'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{ent.base_location || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      {ent.status ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-success/20 text-success border border-success/20"><CheckCircle className="w-3 h-3" /> Ativo</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-destructive/20 text-destructive border border-destructive/20"><XCircle className="w-3 h-3" /> Inativo</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="icon" onClick={() => openEditModal(ent)} className="h-8 w-8 hover:text-primary">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => handleDelete(ent.id, ent.name)} className="h-8 w-8 hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && filteredEntregadores.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">Nenhum entregador encontrado.</td></tr>
                )}
              </tbody>
            </table></div>
          </div>
        </CardContent>
      </Card>

      {/* MODAL */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[620px] border-border bg-card max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">{editingId ? 'Editar Entregador' : 'Novo Entregador'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-5 py-2">

            {/* Foto */}
            <div className="flex flex-col items-center mb-2">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center border-2 border-dashed border-border overflow-hidden">
                  {formData.photo ? <img src={formData.photo} alt="Foto" className="w-full h-full object-cover" /> : <Camera className="w-7 h-7 text-muted-foreground" />}
                </div>
                <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="text-xs text-white">Alterar</span>
                </div>
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
              <span className="text-xs text-muted-foreground mt-1">Foto (Opcional)</span>
            </div>

            {saveError && (
              <div className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            {/* Dados Pessoais */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="ent-name">Nome Completo *</Label>
                <Input id="ent-name" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-background" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ent-cpf">CPF</Label>
                <Input id="ent-cpf" value={formData.cpf} onChange={(e) => setFormData({ ...formData, cpf: e.target.value })} className="bg-background" placeholder="Opcional" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ent-phone">Telefone</Label>
                <Input id="ent-phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="bg-background" />
              </div>
            </div>

            {/* Acesso ao Sistema */}
            <div className="rounded-lg border border-border p-4 space-y-4 bg-muted/10">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Acesso ao Sistema</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ent-username">Login (usuário) *</Label>
                  <Input
                    id="ent-username"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value.replace(/\s/g, '').toLowerCase() })}
                    className="bg-background"
                    placeholder="ex: joao26"
                    disabled={!!editingId && !!editingUserId}
                  />
                  {!editingId && <p className="text-xs text-muted-foreground">Login: {formData.username || '...'}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ent-password" className="flex items-center gap-2">
                    <KeyRound className="w-3.5 h-3.5" />
                    {editingId ? 'Senha (altere para redefinir)' : 'Senha *'}
                  </Label>
                  <div className="relative">
                    <Input
                      id="ent-password"
                      type={showPassword ? 'text' : 'password'}
                      required={!editingId}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="bg-background pr-10"
                      placeholder="Mínimo 6 caracteres"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Veículo */}
            <div className="rounded-lg border border-border p-4 space-y-4 bg-muted/10">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Veículo</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Veículo</Label>
                  <Select value={formData.vehicleType} onValueChange={(val) => setFormData({ ...formData, vehicleType: val })}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Moto">Moto</SelectItem>
                      <SelectItem value="Carro">Carro (Passeio)</SelectItem>
                      <SelectItem value="Fiorino">Fiorino / Utilitário</SelectItem>
                      <SelectItem value="Van">Van</SelectItem>
                      <SelectItem value="Caminhão">Caminhão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ent-plate">Placa do Veículo</Label>
                  <Input id="ent-plate" value={formData.vehiclePlate} onChange={(e) => setFormData({ ...formData, vehiclePlate: e.target.value })} className="bg-background uppercase" placeholder="ABC-1234" />
                </div>
                {/* Bônus por Empresa */}
                <div className="space-y-2 md:col-span-2">
                  <Label>Bônus por Empresa</Label>
                  {dbCompanies.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nenhuma empresa cadastrada.</p>
                  ) : (
                    <div className="rounded-lg border border-border overflow-hidden">
                      {dbCompanies.map((company, idx) => (
                        <div
                          key={company.id}
                          className={`flex items-center gap-3 px-3 py-2.5 ${
                            idx !== dbCompanies.length - 1 ? 'border-b border-border' : ''
                          } hover:bg-muted/20 transition-colors`}
                        >
                          {/* Cor/logo da empresa */}
                          <div
                            className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center overflow-hidden border border-border/40"
                            style={{ backgroundColor: company.color_hex || '#cccccc' }}
                          >
                            {company.logo_url ? (
                              <img src={company.logo_url} alt={company.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[10px] font-bold text-white">
                                {company.name.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <span className="flex-1 text-sm font-medium text-foreground">{company.name}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">R$</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0,00"
                              value={companyBonuses[company.id] || ''}
                              onChange={(e) =>
                                setCompanyBonuses(prev => ({
                                  ...prev,
                                  [company.id]: e.target.value
                                }))
                              }
                              className="bg-background w-24 h-8 text-sm text-right"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Deixe vazio ou R$0,00 para empresas que não pagam bônus.</p>
                </div>
                <div className="space-y-2">
                  <Label>Base *</Label>
                  <Select value={formData.base} onValueChange={(val) => setFormData({ ...formData, base: val })}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {dbBases.length === 0 && <SelectItem value={formData.base || 'Nenhuma'}>{formData.base || 'Nenhuma'}</SelectItem>}
                      {dbBases.map(b => (
                        <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Rota</Label>
                  <Select value={formData.route} onValueChange={(val) => setFormData({ ...formData, route: val })}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {dbRoutes.length === 0 && <SelectItem value={formData.route || 'Nenhuma'}>{formData.route || 'Nenhuma'}</SelectItem>}
                      {dbRoutes.map(r => (
                        <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status *</Label>
                  <Select value={formData.status} onValueChange={(val) => setFormData({ ...formData, status: val })}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ativo">Ativo</SelectItem>
                      <SelectItem value="Inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Criar Entregador'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
