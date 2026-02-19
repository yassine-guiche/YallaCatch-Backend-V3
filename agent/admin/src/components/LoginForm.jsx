import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { adminAccounts } from '../lib/mockData';
import { LogIn, Eye, EyeOff, User } from 'lucide-react';

const LoginForm = ({ redirectPath = '/' }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();
  const showDemoAccounts = import.meta.env.VITE_USE_MOCK === 'true';

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation simple
    if (!email || !password) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(email, password);
      navigate(redirectPath);
    } catch (err) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (account) => {
    setEmail(account.email);
    setPassword(account.password);
    setError('');

    // Connexion automatique
    setLoading(true);
    try {
      await login(account.email, account.password);
      navigate(redirectPath);
    } catch (err) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'super_admin': return 'text-red-600 bg-red-50';
      case 'admin': return 'text-blue-600 bg-blue-50';
      case 'moderator': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'admin': return 'Administrateur';
      case 'moderator': return 'Modérateur';
      default: return 'Utilisateur';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center shadow-xl">
              <span className="text-white font-bold text-3xl">Y!</span>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">YallaCatch!</h1>
          <p className="text-xl text-blue-600 font-semibold mb-2">Dashboard Admin</p>
          <p className="text-gray-600">Connectez-vous pour accéder au panneau d'administration</p>
        </div>

        {/* Login Form */}
        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">Connexion</CardTitle>
            <CardDescription className="text-center">
              Entrez vos identifiants pour accéder au dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@yallacatch.com"
                  autoComplete="email"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Votre mot de passe"
                    autoComplete="current-password"
                    className="h-11 pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </Button>
                </div>
              </div>

              {error && (
                <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={loading}>
                <LogIn className="h-4 w-4 mr-2" />
                {loading ? 'Connexion...' : 'Se connecter'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Demo Accounts */}
        {showDemoAccounts && (
          <Card className="shadow-xl border-0">
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg font-bold text-center">Comptes de Démonstration</CardTitle>
              <CardDescription className="text-center">
                Cliquez sur un compte pour vous connecter automatiquement
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {adminAccounts.map((account) => (
                <Button
                  key={account.id}
                  variant="outline"
                  className="w-full justify-start h-auto p-4 hover:bg-gray-50"
                  onClick={() => handleDemoLogin(account)}
                  disabled={loading}
                >
                  <div className="flex items-center space-x-3 w-full">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-white" />
                    </div>
                    <div className="text-left flex-1">
                      <div className="font-medium text-gray-900">{account.name}</div>
                      <div className="text-sm text-gray-500">{account.email}</div>
                      <div className={`text-xs px-2 py-1 rounded-full inline-block mt-1 ${getRoleColor(account.role)}`}>
                        {getRoleLabel(account.role)}
                      </div>
                    </div>
                  </div>
                </Button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-gray-500">
          <p>Dashboard d'administration YallaCatch!</p>
          <p className="mt-1">© 2025 - Tous droits réservés</p>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
