import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "./components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Alunos from "./pages/Alunos";
import CadastrarAluno from "./pages/CadastrarAluno";
import Mensagens from "./pages/Mensagens";
import CaixaDeSaida from "./pages/CaixaDeSaida";
import MensagensPredefinidas from "./pages/MensagensPredefinidas";
import AssistenteIA from "./pages/AssistenteIA";
import Automacoes from "./pages/Automacoes";
import AvaliacaoFisica from "./pages/AvaliacaoFisica";
import AgendarAvaliacao from "./pages/AgendarAvaliacao";
import WhatsApp from "./pages/WhatsApp";
import Configuracoes from "./pages/Configuracoes";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog";
import { GlobalNotifier } from "@/components/layout/GlobalNotifier";

const queryClient = new QueryClient();

const protectedPage = (Page: React.ComponentType) => (
  <ProtectedRoute>
    <AppLayout>
      <Page />
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
        <BrowserRouter>
          <AuthProvider>
            <GlobalNotifier />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={protectedPage(Dashboard)} />
              <Route path="/alunos" element={protectedPage(Alunos)} />
              <Route path="/cadastrar-aluno" element={protectedPage(CadastrarAluno)} />
              <Route path="/mensagens" element={protectedPage(Mensagens)} />
              <Route path="/caixa-de-saida" element={protectedPage(CaixaDeSaida)} />
              <Route path="/whatsapp" element={protectedPage(WhatsApp)} />
              <Route path="/mensagens-predefinidas" element={protectedPage(MensagensPredefinidas)} />
              {/* Redirects (rotas antigas) */}
              <Route path="/enviar-mensagem" element={<Navigate to="/mensagens" replace />} />
              <Route path="/agendar-mensagem" element={<Navigate to="/mensagens" replace />} />
              <Route path="/mensagens-agendadas" element={<Navigate to="/caixa-de-saida" replace />} />
              <Route path="/mensagens-enviadas" element={<Navigate to="/caixa-de-saida" replace />} />
              <Route path="/assistente-ia" element={protectedPage(AssistenteIA)} />
              <Route path="/automacoes" element={protectedPage(Automacoes)} />
              <Route path="/avaliacao-fisica" element={protectedPage(AvaliacaoFisica)} />
              <Route path="/agendar-avaliacao" element={protectedPage(AgendarAvaliacao)} />
              <Route path="/configuracoes" element={protectedPage(Configuracoes)} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
