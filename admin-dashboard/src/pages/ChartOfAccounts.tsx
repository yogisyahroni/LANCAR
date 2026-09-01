import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  FolderTree, 
  Plus, 
  Pencil, 
  CheckCircle, 
  XCircle 
} from 'lucide-react';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { AdminPageSkeleton } from '../components/ui/Skeleton';
interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

export default function ChartOfAccounts() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  // Form State
  const [accountCode, setAccountCode] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState('Asset');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ['chart-of-accounts'],
    queryFn: async () => {
      const res = await api.get('/admin/finance/chart-of-accounts');
      return res.data.data;
    }
  });

  const createMutation = useMutation({
    mutationFn: (newAccount: Partial<Account>) => api.post('/admin/finance/chart-of-accounts', newAccount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] });
      setIsModalOpen(false);
      resetForm();
      toast.success('Account created successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to create account');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: Partial<Account> }) => api.put(`/admin/finance/chart-of-accounts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] });
      setIsModalOpen(false);
      resetForm();
      toast.success('Account updated successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to update account');
    }
  });

  const resetForm = () => {
    setEditingAccount(null);
    setAccountCode('');
    setAccountName('');
    setAccountType('Asset');
    setDescription('');
    setIsActive(true);
  };

  const groupBy = <T, K extends PropertyKey>(arr: T[], key: (i: T) => K): Record<K, T[]> => {
    return arr.reduce((acc, item) => {
      const group = key(item);
      acc[group] = acc[group] || [];
      acc[group].push(item);
      return acc;
    }, {} as Record<K, T[]>);
  };

  const openAddModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (account: Account) => {
    setEditingAccount(account);
    setAccountCode(account.account_code);
    setAccountName(account.account_name);
    setAccountType(account.account_type);
    setDescription(account.description || '');
    setIsActive(account.is_active);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAccount) {
      updateMutation.mutate({
        id: editingAccount.id,
        data: {
          account_name: accountName,
          account_type: accountType,
          description,
          is_active: isActive
        }
      });
    } else {
      createMutation.mutate({
        account_code: accountCode,
        account_name: accountName,
        account_type: accountType,
        description,
        is_active: isActive
      });
    }
  };

  const getAccountTypeColor = (type: string) => {
    switch (type) {
      case 'Asset': return 'bg-blue-100 text-blue-800';
      case 'Liability': return 'bg-red-100 text-red-800';
      case 'Equity': return 'bg-purple-100 text-purple-800';
      case 'Revenue': return 'bg-green-100 text-green-800';
      case 'Expense': return 'bg-orange-100 text-orange-800';
      case 'Reserve': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) return <AdminPageSkeleton />;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FolderTree className="w-8 h-8 text-indigo-600" />
            Chart of Accounts
          </h1>
          <p className="text-gray-500 mt-1">Manage general ledger accounts for accounting and reporting.</p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Account
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account Code</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {accounts.map((acc) => (
              <tr key={acc.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{acc.account_code}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{acc.account_name}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getAccountTypeColor(acc.account_type)}`}>
                    {acc.account_type}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {acc.is_active ? (
                    <span className="flex items-center text-sm text-green-600 font-medium">
                      <CheckCircle className="w-4 h-4 mr-1" /> Active
                    </span>
                  ) : (
                    <span className="flex items-center text-sm text-red-600 font-medium">
                      <XCircle className="w-4 h-4 mr-1" /> Inactive
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-xs">{acc.description}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button 
                    onClick={() => openEditModal(acc)}
                    className="text-indigo-600 hover:text-indigo-900 p-1 rounded-md hover:bg-indigo-50 transition-colors"
                  >
                    <Pencil className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No accounts found. Please add a new account.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">
                {editingAccount ? "Edit Account" : "Add Account"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {!editingAccount && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Account Code</label>
                    <input
                      type="text"
                      required
                      value={accountCode}
                      onChange={(e) => setAccountCode(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                      placeholder="e.g. 1001"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700">Account Name</label>
                  <input
                    type="text"
                    required
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                    placeholder="e.g. Cash Main"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Account Type</label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="Asset">Asset</option>
                    <option value="Liability">Liability</option>
                    <option value="Equity">Equity</option>
                    <option value="Revenue">Revenue</option>
                    <option value="Expense">Expense</option>
                    <option value="Reserve">Reserve</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                    placeholder="Optional description"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    id="is_active"
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                    Active Account
                  </label>
                </div>

                <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    {editingAccount ? 'Save Changes' : 'Create Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
