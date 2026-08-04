import React, { useRef, useState, useEffect } from "react";
import { ShieldCheck, Plus, Search, Edit, Trash2, CheckCircle, XCircle, Camera, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/src/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { supabase } from '@/src/lib/supabase';
import { logAction } from '@/src/lib/audit';
import { adminCreateUser, adminUpdateUser } from '@/src/lib/adminApi';

interface Collaborator {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  role: string;
  username: string;
  base: string;
  status: boolean;
  photo?: string;
}

export function Conferentes() {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [dbBases, setDbBases] = useState<{id: string, name: string}[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    cpf: '',
    phone: '',
    role: 'CONFERENTE',
    username: '',
    password: '',
    base: 'Guapimirim',
    status: 'Ativo',
    photo: ''
  });

  useEffect(() => {
    fetchCollaborators();
    fetchOptions();
  }, []);

  const fetchOptions = async () => {
    const { data } = await supabase.from('bases').select('id, name').eq('status', true).order('name');
    if (data) setDbBases(data);
  };

  const fetchCollaborators = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('users')
      .select(`
        id,
        name,
        email,
        role,
        status,
        avatar_url,
        checkers (
          cpf,
          phone,
          base_location
        )
      `)
      .eq('role', 'CONFERENTE');

    if (!error && data) {
      const formatted = data.map((u: any) => {
        const checkerData = u.checkers?.[0] || {};
        return {
          id: u.id,
          name: u.name,
          cpf: checkerData.cpf || '',
          phone: checkerData.phone || '',
          role: u.role,
          username: u.email.split('@')[0],
          base: checkerData.base_location || 'Guapimirim',
          status: u.status,
          photo: u.avatar_url || ''
        };
      });
      setCollaborators(formatted);
    }
    setIsLoading(false);
  };

  const filteredCollaborators = collaborators.filter(colab =>
    colab.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    colab.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
    colab.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openNewModal = () => {
    setEditingId(null);
    setSaveError(null);
    setFormData({ 
      name: '', cpf: '', phone: '', role: 'CONFERENTE', username: '', password: '', 
      base: dbBases.length > 0 ? dbBases[0].name : '', 
      status: 'Ativo', photo: '' 
    });
    setIsModalOpen(true);
  };

  const openEditModal = (colab: Collaborator) => {
    setEditingId(colab.id);
    setSaveError(null);
    setFormData({
      name: colab.name,
      cpf: colab.cpf,
      phone: colab.phone,
      role: colab.role,
      username: colab.username,
      password: '',
      base: colab.base || (dbBases.length > 0 ? dbBases[0].name : ''),
      status: colab.status ? 'Ativo' : 'Inativo',
      photo: colab.photo || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm('Tem certeza que deseja inativar este conferente?')) {
      await supabase.from('users').update({ status: false }).eq('id', id);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) await logAction(user.email, 'INATIVOU', 'CONFERENTE', name);
      
      fetchCollaborators();
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Resize to max 300px to keep base64 small
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxSize = 300;
          let { width, height } = img;
          if (width > height) { if (width > maxSize) { height = (height * maxSize) / width; width = maxSize; } }
          else { if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; } }
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
          setFormData(prev => ({ ...prev, photo: canvas.toDataURL('image/jpeg', 0.8) }));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const adminEmail = user?.email || 'admin@sistema.com';

      if (editingId) {
        // --- EDITAR conferente existente ---
        // 1. Atualiza dados em public.users
        await supabase.from('users').update({
          name: formData.name,
          status: formData.status === 'Ativo',
          avatar_url: formData.photo || null
        }).eq('id', editingId);

        // 2. Atualiza checkers (CPF, phone, base)
        await supabase.from('checkers').upsert({
          user_id: editingId,
          cpf: formData.cpf || null,
          phone: formData.phone || null,
          base_location: formData.base
        }, { onConflict: 'user_id' });

        if (formData.password) {
          await adminUpdateUser({ userId: editingId, password: formData.password });
        }
        
        await logAction(adminEmail, 'EDITOU', 'CONFERENTE', formData.name);

      } else {
        // --- CRIAR novo conferente ---
        if (!formData.username || !formData.password) throw new Error('Usuário e senha são obrigatórios.');
        if (formData.password.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres.');

        const email = `${formData.username.trim()}@jackarlo.com`;

        // 1. Cria usuário no Auth via Edge Function
        const createdUser = await adminCreateUser({
          email,
          password: formData.password,
          user_metadata: { full_name: formData.name, name: formData.name, role: 'CONFERENTE' }
        });

        if (createdUser.error || !createdUser.data?.user?.id) {
          throw new Error(createdUser.error || 'Erro ao criar usuário no Auth.');
        }

        const userId = createdUser.data.user.id;

        // 2. Insere em public.users (trigger pode ter falhado silenciosamente)
        await supabase.from('users').upsert({
          id: userId,
          email,
          name: formData.name,
          role: 'CONFERENTE',
          status: true,
          avatar_url: formData.photo || null
        }, { onConflict: 'id' });

        // 3. Insere em checkers
        await supabase.from('checkers').insert({
          user_id: userId,
          cpf: formData.cpf || null,
          phone: formData.phone || null,
          base_location: formData.base
        });
        
        await logAction(adminEmail, 'CRIOU', 'CONFERENTE', formData.name);
      }

      fetchCollaborators();
      setIsModalOpen(false);
    } catch (err: any) {
      let msg = err.message || 'Erro desconhecido ao salvar.';
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
        <h1 className="text-2xl font-bold tracking-tight">Conferentes</h1>
        <Button onClick={openNewModal} className="gap-2 shadow-lg shadow-primary/20">
          <Plus className="h-4 w-4" />
          Novo Conferente
        </Button>
      </div>

      <Card className="bg-card border-border shadow-sm">
        <CardHeader className="border-b border-border p-4 bg-muted/20">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, cargo ou usuário..."
              className="pl-9 bg-background"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="overflow-x-auto w-full"><table className="w-full text-sm text-left min-w-[800px]">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">Conferente</th>
                  <th className="px-6 py-4 font-medium">Contato</th>
                  <th className="px-6 py-4 font-medium">Cargo / Base</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">Carregando conferentes...</td></tr>
                ) : filteredCollaborators.map((colab) => (
                  <tr key={colab.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center border border-border shrink-0 overflow-hidden">
                          {colab.photo ? (
                            <img src={colab.photo} alt={colab.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="font-bold text-foreground text-xs">{colab.name.substring(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-foreground">{colab.name}</div>
                          <div className="text-xs text-muted-foreground">@{colab.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-foreground">{colab.phone || '-'}</div>
                      <div className="text-xs text-muted-foreground">CPF: {colab.cpf || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{colab.role}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{colab.base || 'Guapimirim'}</div>
                    </td>
                    <td className="px-6 py-4">
                      {colab.status ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-success/20 text-success border border-success/20">
                          <CheckCircle className="w-3 h-3" /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-destructive/20 text-destructive border border-destructive/20">
                          <XCircle className="w-3 h-3" /> Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="icon" onClick={() => openEditModal(colab)} className="h-8 w-8 hover:text-primary">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => handleDelete(colab.id, colab.name)} className="h-8 w-8 hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && filteredCollaborators.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">Nenhum conferente encontrado.</td></tr>
                )}
              </tbody>
            </table></div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px] border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl">{editingId ? 'Editar Conferente' : 'Novo Conferente'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">

            {/* Foto */}
            <div className="flex flex-col items-center justify-center mb-4">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="w-24 h-24 rounded-full bg-accent flex items-center justify-center border-2 border-dashed border-border overflow-hidden">
                  {formData.photo ? (
                    <img src={formData.photo} alt="Foto de perfil" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="text-xs text-white font-medium">Alterar</span>
                </div>
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
              <span className="text-xs text-muted-foreground mt-2">Foto de Perfil (Opcional)</span>
            </div>

            {saveError && (
              <div className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome Completo *</Label>
                <Input id="name" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-background" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input id="cpf" value={formData.cpf} onChange={(e) => setFormData({ ...formData, cpf: e.target.value })} className="bg-background" placeholder="Opcional" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="bg-background" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Usuário de Acesso *</Label>
                <Input
                  id="username"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="bg-background"
                  disabled={!!editingId}
                  placeholder="ex: joao26"
                />
                {!editingId && <p className="text-xs text-muted-foreground">Login: {formData.username || '...'}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{editingId ? 'Nova Senha (deixe em branco para manter)' : 'Senha *'}</Label>
                <Input id="password" type="password" required={!editingId} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="bg-background" placeholder="Mínimo 6 caracteres" />
              </div>
              <div className="space-y-2">
                <Label>Base *</Label>
                <Select value={formData.base} onValueChange={(val) => setFormData({...formData, base: val})}>
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

            <DialogFooter className="pt-4 mt-6 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Criar Conferente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
