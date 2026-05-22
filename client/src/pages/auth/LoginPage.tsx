import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/authService';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      const { token, user } = await authService.login(email, password);
      setAuth(token, user);
      toast.success(`Welcome back, ${user.name}!`);
      navigate(user.role === 'cashier' ? '/pos' : '/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-charcoal-800 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-gold-700/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-gold-700/8 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-charcoal-700/30 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md relative"
      >
        {/* Card */}
        <div className="bg-charcoal-700 border border-charcoal-500 rounded-3xl p-8 shadow-card">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <img
              src="/logo.jpg"
              alt="The Outfit Lounge"
              className="w-20 h-20 rounded-2xl object-cover shadow-gold mb-4"
            />
            <h1 className="font-display text-2xl font-semibold text-charcoal-50">The Outfit Lounge</h1>
            <p className="text-charcoal-200 text-sm mt-1">POS & Rental Management</p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-charcoal-500" />
            <span className="text-xs text-charcoal-300 font-medium">SIGN IN</span>
            <div className="flex-1 h-px bg-charcoal-500" />
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@tailorshop.com"
              required
              autoComplete="email"
            />

            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              iconRight={
                <button type="button" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full mt-2"
              icon={<LogIn size={18} />}
            >
              Sign In
            </Button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 p-3 bg-charcoal-600/50 rounded-xl border border-charcoal-500">
            <p className="text-xs text-charcoal-200 text-center mb-2 font-medium">Demo Credentials</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-charcoal-200">
              <div>
                <span className="text-charcoal-300">Email:</span>
                <br />
                <code className="text-gold-500">admin@tailorshop.com</code>
              </div>
              <div>
                <span className="text-charcoal-300">Password:</span>
                <br />
                <code className="text-gold-500">Admin@1234</code>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-charcoal-300 mt-6">
          © {new Date().getFullYear()} The Outfit Lounge. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}
