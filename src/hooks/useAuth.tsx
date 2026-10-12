import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ALL_STAFF, type StaffRole } from "@/lib/staffRoles";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: StaffRole | null;
  roleLoading: boolean;
  roleError: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const identityRef = useRef<string | null>(null);
  const roleRef = useRef<StaffRole | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [roleError, setRoleError] = useState(false);

  useEffect(() => {
    let disposed = false;
    let authEventReceived = false;
    const applySession = (next: Session | null) => {
      if (disposed) return;
      const id = next?.user.id ?? null;
      if (identityRef.current !== id) {
        queryClient.clear();
        setRole(null);
        roleRef.current = null;
        setResolvedUserId(null);
        identityRef.current = id;
      }
      setSession(next);
      setUser(next?.user ?? null);
      setLoading(false);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      authEventReceived = true;
      applySession(s);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!authEventReceived) applySession(data.session);
    }).catch(() => {
      if (!authEventReceived) applySession(null);
    });

    return () => { disposed = true; sub.subscription.unsubscribe(); };
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;
    setRole(null);
    setRoleError(false);
    if (!user?.id) {
      setRoleLoading(false);
      return;
    }
    setRoleLoading(true);
    let inFlight = false;
    const refreshRole = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const { data, error } = await supabase.rpc("current_staff_role");
        if (cancelled) return;
        const nextRole = !error && ALL_STAFF.includes(data as StaffRole) ? data as StaffRole : null;
        if (nextRole !== roleRef.current) queryClient.clear();
        roleRef.current = nextRole;
        setRole(nextRole);
        setRoleError(Boolean(error));
      } catch {
        if (cancelled) return;
        queryClient.clear();
        roleRef.current = null;
        setRole(null);
        setRoleError(true);
      } finally {
        inFlight = false;
        if (!cancelled) {
          setResolvedUserId(user.id);
          setRoleLoading(false);
        }
      }
    };
    void refreshRole();
    const timer = window.setInterval(() => void refreshRole(), 60_000);
    const onFocus = () => void refreshRole();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [user?.id, session?.access_token, queryClient]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading,
      role: resolvedUserId === user?.id ? role : null,
      roleLoading: roleLoading || Boolean(user && resolvedUserId !== user.id), roleError, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
