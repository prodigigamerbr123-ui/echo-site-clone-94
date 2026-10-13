import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { lazy, Suspense } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "./components/layout/AppLayout";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog";
import { GlobalNotifier } from "@/components/layout/GlobalNotifier";
import { ADMIN_ONLY, FRONT_DESK, ALL_STAFF, type StaffRole } from "@/lib/staffRoles";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Alunos = lazy(() => import("./pages/Alunos"));
const CadastrarAluno = lazy(() => import("./pages/CadastrarAluno"));
const Mensagens = lazy(() => import("./pages/Mensagens"));
const CaixaDeSaida = lazy(() => import("./pages/CaixaDeSaida"));
const MensagensPredefinidas = lazy(() => import("./pages/MensagensPredefinidas"));
const AssistenteIA = lazy(() => import("./pages/AssistenteIA"));
const Automacoes = lazy(() => import("./pages/Automacoes"));
const AvaliacaoFisica = lazy(() => import("./pages/AvaliacaoFisica"));
const AgendarAvaliacao = lazy(() => import("./pages/AgendarAvaliacao"));
const WhatsApp = lazy(() => import("./pages/WhatsApp"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();
const Router = import.meta.env.VITE_DEPLOY_TARGET === "github-pages" ? HashRouter : BrowserRouter;

const protectedPage = (Page: React.ComponentType, roles: readonly StaffRole[] = ALL_STAFF) => (
  <ProtectedRoute allowedRoles={roles}>
    <AppLayout>
      <Suspense fallback={<div role="status" className="py-8 text-center text-muted-foreground">Carregando página...</div>}>
        <Page />
      </Suspense>
    </AppLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="system" storageKey="workout-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ConfirmDialogHost />
        <Router>
          <AuthProvider>
            <GlobalNotifier />
            <Suspense fallback={<div role="status" className="p-8 text-center text-muted-foreground">Carregando página...</div>}>
              <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={protectedPage(Dashboard)} />
              <Route path="/alunos" element={protectedPage(Alunos)} />
              <Route path="/cadastrar-aluno" element={protectedPage(CadastrarAluno, FRONT_DESK)} />
              <Route path="/mensagens" element={protectedPage(Mensagens, FRONT_DESK)} />
              <Route path="/caixa-de-saida" element={protectedPage(CaixaDeSaida, FRONT_DESK)} />
              <Route path="/whatsapp" element={protectedPage(WhatsApp, ADMIN_ONLY)} />
              <Route path="/mensagens-predefinidas" element={protectedPage(MensagensPredefinidas)} />
              {/* Redirects (rotas antigas) */}
              <Route path="/enviar-mensagem" element={<Navigate to="/mensagens" replace />} />
              <Route path="/agendar-mensagem" element={<Navigate to="/mensagens" replace />} />
              <Route path="/mensagens-agendadas" element={<Navigate to="/caixa-de-saida" replace />} />
              <Route path="/mensagens-enviadas" element={<Navigate to="/caixa-de-saida" replace />} />
              <Route path="/assistente-ia" element={protectedPage(AssistenteIA, FRONT_DESK)} />
              <Route path="/automacoes" element={protectedPage(Automacoes, ADMIN_ONLY)} />
              <Route path="/avaliacao-fisica" element={protectedPage(AvaliacaoFisica)} />
              <Route path="/agendar-avaliacao" element={protectedPage(AgendarAvaliacao)} />
              <Route path="/configuracoes" element={protectedPage(Configuracoes, ADMIN_ONLY)} />
              <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </Router>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
