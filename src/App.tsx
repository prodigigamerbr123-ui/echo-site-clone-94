import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GlobalNotifier } from "@/components/layout/GlobalNotifier";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ADMIN_ONLY, ALL_STAFF, FRONT_DESK, type StaffRole } from "@/lib/staffRoles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import { lazyPage } from "@/lib/lazyPage";
import { RouteErrorBoundary } from "@/components/layout/RouteErrorBoundary";
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";

const Dashboard = lazyPage(() => import("./pages/Dashboard"));
const Alunos = lazyPage(() => import("./pages/Alunos"));
const CadastrarAluno = lazyPage(() => import("./pages/CadastrarAluno"));
const Mensagens = lazyPage(() => import("./pages/Mensagens"));
const CaixaDeSaida = lazyPage(() => import("./pages/CaixaDeSaida"));
const MensagensPredefinidas = lazyPage(() => import("./pages/MensagensPredefinidas"));
const AssistenteIA = lazyPage(() => import("./pages/AssistenteIA"));
const Automacoes = lazyPage(() => import("./pages/Automacoes"));
const AvaliacaoFisica = lazyPage(() => import("./pages/AvaliacaoFisica"));
const AgendarAvaliacao = lazyPage(() => import("./pages/AgendarAvaliacao"));
const WhatsApp = lazyPage(() => import("./pages/WhatsApp"));
const Configuracoes = lazyPage(() => import("./pages/Configuracoes"));
const Login = lazyPage(() => import("./pages/Login"));
const NotFound = lazyPage(() => import("./pages/NotFound"));

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
            <RouteErrorBoundary>
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
            </RouteErrorBoundary>
          </AuthProvider>
        </Router>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
