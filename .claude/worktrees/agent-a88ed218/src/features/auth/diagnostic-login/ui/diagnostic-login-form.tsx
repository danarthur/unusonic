/**
 * Diagnostic Login Form
 * Japandi-styled login with workspace resolution diagnostics
 * @module features/auth/diagnostic-login/ui/diagnostic-login-form
 */

'use client';

import { useActionState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LogIn, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Database,
  Shield,
  Building2,
  User,
  ChevronDown,
  Eye,
  EyeOff,
} from 'lucide-react';
import { loginAndResolveWorkspace } from '../api/actions';
import type { LoginFormState, QueryDiagnostic } from '../model/types';
import { useState } from 'react';

const initialState: LoginFormState = {
  status: 'idle',
  result: null,
};

export function DiagnosticLoginForm() {
  const [state, action, isPending] = useActionState(loginAndResolveWorkspace, initialState);
  const [showQueries, setShowQueries] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const springConfig = { type: 'spring', stiffness: 300, damping: 30 } as const;
  
  const getStatusIcon = (status: QueryDiagnostic['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'skipped':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    }
  };
  
  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Login Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
        className="liquid-panel p-8"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-ink/5 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-ink" />
          </div>
          <h1 className="text-2xl font-light text-ink tracking-tight">
            Diagnostic Login
          </h1>
          <p className="text-sm text-ink-muted mt-2">
            Authenticate and verify workspace resolution
          </p>
        </div>
        
        {/* Form */}
        <form action={action} className="space-y-4">
          {/* Email Field */}
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-ink-muted uppercase tracking-widest mb-2">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={isPending}
              className="w-full px-4 py-3 rounded-xl
                bg-ink/5 border border-[var(--glass-border)]
                text-ink placeholder:text-ink-muted/50
                focus:outline-none focus:border-[var(--glass-border-hover)] focus:ring-2 focus:ring-ink/5
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200"
              placeholder="you@example.com"
            />
          </div>
          
          {/* Password Field */}
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-ink-muted uppercase tracking-widest mb-2">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                disabled={isPending}
                className="w-full px-4 py-3 pr-12 rounded-xl
                  bg-ink/5 border border-[var(--glass-border)]
                  text-ink placeholder:text-ink-muted/50
                  focus:outline-none focus:border-[var(--glass-border-hover)] focus:ring-2 focus:ring-ink/5
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-200"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isPending}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg
                  text-ink-muted hover:text-ink hover:bg-ink/5
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-200"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
          
          {/* Error Message */}
          <AnimatePresence>
            {state.status === 'error' && state.result?.error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={springConfig}
                className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20"
              >
                <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">
                  {state.result.error}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Submit Button */}
          <motion.button
            type="submit"
            disabled={isPending}
            whileHover={{ scale: isPending ? 1 : 1.01 }}
            whileTap={{ scale: isPending ? 1 : 0.99 }}
            transition={springConfig}
            className="w-full py-3.5 rounded-xl
              bg-ink text-canvas
              font-medium text-sm
              hover:opacity-90
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-200
              flex items-center justify-center gap-2"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Authenticating...
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Sign In & Diagnose
              </>
            )}
          </motion.button>
        </form>
      </motion.div>
      
      {/* Diagnostic Results */}
      <AnimatePresence>
        {state.status === 'success' && state.result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ ...springConfig, delay: 0.1 }}
            className="space-y-4"
          >
            {/* Success Banner */}
            <div className="liquid-panel p-4 border-emerald-500/30 bg-emerald-500/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    Diagnostic Login Successful
                  </h3>
                  <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                    Authentication and workspace resolution complete
                  </p>
                </div>
              </div>
            </div>
            
            {/* User Info Card */}
            <div className="liquid-panel p-5">
              <div className="flex items-center gap-3 mb-4">
                <User className="w-4 h-4 text-ink-muted" />
                <h3 className="text-xs font-medium text-ink-muted uppercase tracking-widest">
                  Authenticated User
                </h3>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink-muted">Email</span>
                  <span className="text-sm font-mono text-ink">{state.result.user?.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink-muted">User ID</span>
                  <span className="text-xs font-mono text-ink bg-ink/5 px-2 py-1 rounded">
                    {state.result.user?.id}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Workspaces Card */}
            <div className="liquid-panel p-5">
              <div className="flex items-center gap-3 mb-4">
                <Building2 className="w-4 h-4 text-ink-muted" />
                <h3 className="text-xs font-medium text-ink-muted uppercase tracking-widest">
                  Detected Workspaces
                </h3>
                <span className="ml-auto text-xs font-mono bg-ink/5 px-2 py-0.5 rounded-full">
                  {state.result.workspaces.length} found
                </span>
              </div>
              
              {state.result.workspaces.length > 0 ? (
                <div className="space-y-2">
                  {state.result.workspaces.map((ws, i) => (
                    <motion.div
                      key={ws.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...springConfig, delay: 0.2 + i * 0.05 }}
                      className="p-3 rounded-xl bg-ink/5 border border-[var(--glass-border)]"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-ink">
                          {ws.name || 'Unnamed Workspace'}
                        </span>
                        {ws.role && (
                          <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-walnut/10 text-walnut">
                            {ws.role}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono text-ink-muted">
                        {ws.id}
                      </span>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-center">
                  <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto mb-2" />
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    No workspaces found for this user
                  </p>
                  <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1">
                    User may not have been assigned to any workspaces yet
                  </p>
                </div>
              )}
            </div>
            
            {/* Diagnostics Card */}
            <div className="liquid-panel p-5">
              <div className="flex items-center gap-3 mb-4">
                <Database className="w-4 h-4 text-ink-muted" />
                <h3 className="text-xs font-medium text-ink-muted uppercase tracking-widest">
                  Schema Diagnostics
                </h3>
              </div>
              
              {/* Quick Status */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="flex items-center gap-2">
                  {state.result.diagnostics.workspaceMembersTableExists ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span className="text-xs text-ink-muted">workspace_members</span>
                </div>
                <div className="flex items-center gap-2">
                  {state.result.diagnostics.workspacesTableExists ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span className="text-xs text-ink-muted">workspaces</span>
                </div>
                <div className="flex items-center gap-2">
                  {state.result.diagnostics.profilesTableExists ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span className="text-xs text-ink-muted">profiles</span>
                </div>
                <div className="flex items-center gap-2">
                  {state.result.diagnostics.rlsWorking === true ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : state.result.diagnostics.rlsWorking === false ? (
                    <XCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  )}
                  <span className="text-xs text-ink-muted">RLS Working</span>
                </div>
              </div>
              
              {/* Query Details Accordion */}
              <button
                onClick={() => setShowQueries(!showQueries)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-ink/5 hover:bg-ink/10 transition-colors"
              >
                <span className="text-xs font-medium text-ink-muted">
                  Query Details ({state.result.diagnostics.queries.length})
                </span>
                <ChevronDown className={`w-4 h-4 text-ink-muted transition-transform ${showQueries ? 'rotate-180' : ''}`} />
              </button>
              
              <AnimatePresence>
                {showQueries && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={springConfig}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 space-y-2">
                      {state.result.diagnostics.queries.map((query, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 p-2 rounded-lg bg-ink/5"
                        >
                          {getStatusIcon(query.status)}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-ink truncate">
                              {query.name}
                            </p>
                            {query.message && (
                              <p className="text-[10px] text-ink-muted truncate">
                                {query.message}
                              </p>
                            )}
                          </div>
                          {query.rowCount !== undefined && (
                            <span className="text-[10px] font-mono text-ink-muted">
                              {query.rowCount} rows
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
