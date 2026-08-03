import React, { useRef, useState, useEffect } from "react";
import { Plus, Search, Edit, Trash2, CheckCircle, XCircle, Users, Camera, Eye, EyeOff, AlertCircle, KeyRound } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/src/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { supabase } from '@/src/lib/supabase';
import { logAction } from '@/src/lib/audit';

const SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY as string;
const PROJECT_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface SystemUser {
  id: string;
  name: string;
  username: string;       // email sem o @jackarlo.com
  role: 'ADMIN' | 'CONFERENTE' | 'ENTREGADOR';
  status: boolean;
  photo?: string;
  plain_password?: string;
}

export function Usuarios() {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [visiblePasswordId, setVisiblePasswordId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    role: 'CONFERENTE',
    status: 'Ativo',
    photo: ''
  });

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, status, avatar_url, plain_password')
      .order('name');

    if (!error && data) {
      setUsers(data.map((u: any) => ({
        id: u.id,
        name: u.name,
        username: (u.email || '').split('@')[0],
        role: u.role,
        status: u.status,
        photo: u.avatar_url || '',
        plain_password: u.plain_password || ''
      })));
    }
    setIsLoading(false);
  };

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openNewModal = () => {
    setEditingId(null);
    setSaveError(null);
    setShowPassword(false);
    setFormData({ name: '', username: '', password: '', role: 'ADMIN', status: 'Ativo', photo: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (user: SystemUser) => {
    setEditingId(user.id);
    setSaveError(null);
    setShowPassword(false);
    setFormData({
      name: user.name,
      username: user.username,
      password: user.plain_password || '',
      role: user.role,
      status: user.status ? 'Ativo' : 'Inativo',
      photo: user.photo || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm('Tem certeza que deseja DELETAR PERMANENTEMENTE este usuário?')) {
      // Deleta do Auth via Admin API
      await fetch(`${PROJECT_URL}/auth/v1/admin/users/${id}`, {
        method: 'DELETE',
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      // Deleta das tabelas públicas
      await supabase.from('users').delete().eq('id', id);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) await logAction(user.email, 'DELETOU', 'USUÁRIO', name);
      
      fetchUsers();
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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
        // ===== EDITAR usuário existente =====
        const email = `${formData.username.trim()}@jackarlo.com`;

        // 1. Atualiza email (login) no auth.users via Admin API se mudou
        const currentUser = users.find(u => u.id === editingId);
        if (currentUser && currentUser.username !== formData.username.trim()) {
          const res = await fetch(`${PROJECT_URL}/auth/v1/admin/users/${editingId}`, {
            method: 'PUT',
            headers: {
              'apikey': SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.msg || 'Erro ao atualizar login.');
        }

        // 2. Atualiza senha se preenchida
        if (formData.password && formData.password !== currentUser?.plain_password) {
          if (formData.password.length < 6) throw new Error('Senha deve ter pelo menos 6 caracteres.');
          const res = await fetch(`${PROJECT_URL}/auth/v1/admin/users/${editingId}`, {
            method: 'PUT',
            headers: {
              'apikey': SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password: formData.password })
          });
          if (!res.ok) {
            const result = await res.json();
            throw new Error(result.msg || 'Erro ao atualizar senha.');
          }
        }

        // 3. Atualiza public.users
        await supabase.from('users').update({
          name: formData.name,
          email,
          role: formData.role as any,
          status: formData.status === 'Ativo',
          avatar_url: formData.photo || null,
          plain_password: formData.password || null
        }).eq('id', editingId);

        // 4. Sincroniza as tabelas específicas
        if (formData.role === 'ENTREGADOR') {
          await supabase.from('drivers').upsert({
            user_id: editingId,
            name: formData.name,
            status: formData.status === 'Ativo',
            photo_url: formData.photo || null
          }, { onConflict: 'user_id' });
        } else if (formData.role === 'CONFERENTE') {
          await supabase.from('checkers').upsert({
            user_id: editingId
          }, { onConflict: 'user_id' });
        }
        
        await logAction(adminEmail, 'EDITOU', 'USUÁRIO', formData.name);

      } else {
        // ===== CRIAR novo usuário =====
        if (!formData.username.trim()) throw new Error('Login é obrigatório.');
        if (!formData.password) throw new Error('Senha é obrigatória.');
        if (formData.password.length < 6) throw new Error('Senha deve ter pelo menos 6 caracteres.');

        const email = `${formData.username.trim()}@jackarlo.com`;

        const createRes = await fetch(`${PROJECT_URL}/auth/v1/admin/users`, {
          method: 'POST',
          headers: {
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email,
            password: formData.password,
            email_confirm: true,
            user_metadata: { full_name: formData.name, name: formData.name, role: formData.role }
          })
        });

        const createdUser = await createRes.json();
        if (!createRes.ok || !createdUser.id) {
          throw new Error(createdUser.msg || 'Erro ao criar usuário.');
        }

        await supabase.from('users').upsert({
          id: createdUser.id,
          email,
          name: formData.name,
          role: formData.role as any,
          status: formData.status === 'Ativo',
          avatar_url: formData.photo || null,
          plain_password: formData.password
        }, { onConflict: 'id' });

        // Sincroniza com as tabelas de perfis dependendo do cargo
        if (formData.role === 'ENTREGADOR') {
          await supabase.from('drivers').upsert({
            user_id: createdUser.id,
            name: formData.name,
            status: formData.status === 'Ativo',
            photo_url: formData.photo || null
          }, { onConflict: 'user_id' });
        } else if (formData.role === 'CONFERENTE') {
          await supabase.from('checkers').upsert({
            user_id: createdUser.id
          }, { onConflict: 'user_id' });
        }
        
        await logAction(adminEmail, 'CRIOU', 'USUÁRIO', formData.name);
      }

      fetchUsers();
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

  const roleLabel = (role: string) => {
    if (role === 'ADMIN') return 'Administrador';
    if (role === 'CONFERENTE') return 'Conferente';
    return 'Entregador';
  };

  const roleBadge = (role: string) => {
    if (role === 'ADMIN') return 'bg-yellow-500/20 text-yellow-600 border-yellow-500/20 dark:text-yellow-400';
    if (role === 'CONFERENTE') return 'bg-blue-500/20 text-blue-600 border-blue-500/20 dark:text-blue-400';
    return 'bg-emerald-500/20 text-emerald-700 border-emerald-500/20 dark:text-emerald-400';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Usuários do Sistema</h1>
        <Button onClick={openNewModal} className="gap-2 shadow-lg shadow-primary/20">
          <Plus className="h-4 w-4" />
          Novo Admin
        </Button>
      </div>

      <Card className="bg-card border-border shadow-sm">
        <CardHeader className="border-b border-border p-4 bg-muted/20">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, login ou perfil..."
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
                  <th className="px-6 py-4 font-medium">Usuário</th>
                  <th className="px-6 py-4 font-medium">Perfil de Acesso</th>
                  <th className="px-6 py-4 font-medium">Senha (Admin)</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">Carregando usuários...</td></tr>
                ) : filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center border border-border shrink-0 overflow-hidden">
                          {user.photo ? (
                            <img src={user.photo} alt={user.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="font-bold text-xs text-muted-foreground">{user.name.substring(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-foreground">{user.name}</div>
                          <div className="text-xs text-muted-foreground">@{user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${roleBadge(user.role)}`}>
                        {roleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {user.plain_password ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-foreground">
                            {visiblePasswordId === user.id ? user.plain_password : '••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setVisiblePasswordId(visiblePasswordId === user.id ? null : user.id)}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            title={visiblePasswordId === user.id ? 'Ocultar senha' : 'Ver senha'}
                          >
                            {visiblePasswordId === user.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Não registrada</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {user.status ? (
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
                        <Button variant="outline" size="icon" onClick={() => openEditModal(user)} className="h-8 w-8 hover:text-primary" title="Editar">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => handleDelete(user.id, user.name)} className="h-8 w-8 hover:text-destructive hover:border-destructive/50" title="Desativar">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && filteredUsers.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">Nenhum usuário encontrado.</td></tr>
                )}
              </tbody>
            </table></div>
          </div>
        </CardContent>
      </Card>

      {/* MODAL */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[520px] border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              {editingId ? 'Editar Usuário' : 'Novo Usuário'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">

            {/* Foto */}
            <div className="flex flex-col items-center justify-center mb-2">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center border-2 border-dashed border-border overflow-hidden">
                  {formData.photo ? (
                    <img src={formData.photo} alt="Foto" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-7 h-7 text-muted-foreground" />
                  )}
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

            <div className="grid grid-cols-1 gap-4">
              {/* Nome */}
              <div className="space-y-2">
                <Label htmlFor="u-name">Nome Completo *</Label>
                <Input id="u-name" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-background" />
              </div>

              {/* Login */}
              <div className="space-y-2">
                <Label htmlFor="u-username">Login (usuário) *</Label>
                <Input
                  id="u-username"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value.replace(/\s/g, '').toLowerCase() })}
                  className="bg-background"
                  placeholder="ex: joao26"
                />
                <p className="text-xs text-muted-foreground">Login completo: {formData.username || '...'}</p>
              </div>

              {/* Senha com olhinho */}
              <div className="space-y-2">
                <Label htmlFor="u-password" className="flex items-center gap-2">
                  <KeyRound className="w-3.5 h-3.5" />
                  {editingId ? 'Senha (altere para redefinir)' : 'Senha *'}
                </Label>
                <div className="relative">
                  <Input
                    id="u-password"
                    type={showPassword ? 'text' : 'password'}
                    required={!editingId}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="bg-background pr-10"
                    placeholder="Mínimo 6 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {editingId && (
                  <p className="text-xs text-muted-foreground">A senha atual está preenchida. Edite para alterar, ou mantenha para não mudar.</p>
                )}
              </div>

              {/* Perfil */}
              <div className="space-y-2">
                <Label>Perfil de Acesso *</Label>
                <Select value={formData.role} onValueChange={(val) => setFormData({ ...formData, role: val })} disabled={!editingId}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Administrador</SelectItem>
                    <SelectItem value="CONFERENTE">Conferente</SelectItem>
                    <SelectItem value="ENTREGADOR">Entregador</SelectItem>
                  </SelectContent>
                </Select>
                {!editingId && <p className="text-xs text-muted-foreground">Na aba Usuários só é possível criar novos Administradores.</p>}
              </div>

              {/* Status */}
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
                {isSaving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Criar Usuário'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
