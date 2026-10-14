import type { StaffRole } from "@/lib/staffRoles";
import type { Session, User } from "@supabase/supabase-js";
import { createContext } from "react";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: StaffRole | null;
  roleLoading: boolean;
  roleError: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
