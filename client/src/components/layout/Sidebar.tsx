import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Package, Users, Calendar, ShoppingCart,
  ArchiveX, RotateCcw, BarChart3, Bell, Settings,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuthStore } from '@/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { path: '/pos', label: 'POS', icon: ShoppingCart, highlight: true, module: 'pos' },
  { path: '/rentals', label: 'Rentals', icon: Calendar, module: 'rentals' },
  { path: '/returns', label: 'Returns', icon: RotateCcw, module: 'returns' },
  { path: '/products', label: 'Products', icon: Package, module: 'products' },
  { path: '/customers', label: 'Customers', icon: Users, module: 'customers' },
  { path: '/inventory', label: 'Inventory', icon: ArchiveX, module: 'inventory' },
  { path: '/reports', label: 'Reports', icon: BarChart3, module: 'reports' },
  { path: '/notifications', label: 'Notifications', icon: Bell, module: 'notifications' },
  { path: '/settings', label: 'Settings', icon: Settings, module: 'settings' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user } = useAuthStore();
  const location = useLocation();
  const { hasPermission } = usePermissions();
  const visibleItems = NAV_ITEMS.filter(({ module }) => hasPermission(module, 'read'));

  return (
    <motion.aside
      animate={{ width: collapsed ? 70 : 240 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="fixed left-0 top-0 h-screen bg-charcoal-900 border-r border-charcoal-600 z-30 flex flex-col overflow-hidden"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 p-4 border-b border-charcoal-600 h-16 flex-shrink-0">
        <img
          src="/logo.jpg"
          alt="The Royale Lounge"
          className="w-9 h-9 rounded-xl object-cover flex-shrink-0"
        />
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <p className="font-display font-semibold text-charcoal-50 leading-tight text-sm">The Royale Lounge</p>
              <p className="text-xs text-gold-600">POS & Rental</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1 scrollbar-thin no-scrollbar">
        {visibleItems.map(({ path, label, icon: Icon, highlight }) => {
          const active = location.pathname.startsWith(path);
          return (
            <NavLink
              key={path}
              to={path}
              className={cn(
                'sidebar-item',
                active && 'active',
                highlight && !active && 'text-gold-500 hover:text-gold-400',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="text-sm font-medium truncate"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </NavLink>
          );
        })}
      </nav>

      {/* User info */}
      <div className="border-t border-charcoal-600 p-3 flex-shrink-0">
        {user && !collapsed && (
          <div className="flex items-center gap-2.5 mb-3 px-1">
            <div className="w-8 h-8 rounded-full bg-gold-700/30 border border-gold-700/50 flex items-center justify-center flex-shrink-0">
              <span className="text-gold-400 text-xs font-semibold">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-charcoal-50 truncate">{user.name}</p>
              <p className="text-xs text-charcoal-200 capitalize truncate">
                {user.role.replace('_', ' ')}
              </p>
            </div>
          </div>
        )}

        {/* Toggle button */}
        <button
          onClick={onToggle}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-2 rounded-xl',
            'text-charcoal-200 hover:bg-charcoal-600 hover:text-charcoal-50 transition-colors text-xs'
          )}
        >
          {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={14} /><span>Collapse</span></>}
        </button>
      </div>
    </motion.aside>
  );
}
