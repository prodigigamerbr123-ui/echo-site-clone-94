import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "./components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Alunos from "./pages/Alunos";
import CadastrarAluno from "./pages/CadastrarAluno";
import EnviarMensagem from "./pages/EnviarMensagem";
import MensagensAgendadas from "./pages/MensagensAgendadas";
import AgendarMensagem from "./pages/AgendarMensagem";
import MensagensPredefinidas from "./pages/MensagensPredefinidas";
import MensagensEnviadas from "./pages/MensagensEnviadas";
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
              <Route path="/agendar-mensagem" element={protectedPage(AgendarMensagem)} />
              <Route path="/whatsapp" element={protectedPage(WhatsApp)} />
              <Route path="/enviar-mensagem" element={protectedPage(EnviarMensagem)} />
              <Route path="/mensagens-agendadas" element={protectedPage(MensagensAgendadas)} />
              <Route path="/mensagens-predefinidas" element={protectedPage(MensagensPredefinidas)} />
              <Route path="/mensagens-enviadas" element={protectedPage(MensagensEnviadas)} />
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
