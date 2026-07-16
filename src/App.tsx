import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AppLayout } from "./components/layout/AppLayout";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Alunos from "./pages/Alunos";
import CadastrarAluno from "./pages/CadastrarAluno";
import EnviarMensagem from "./pages/EnviarMensagem";
import MensagensAgendadas from "./pages/MensagensAgendadas";
import AgendarMensagem from "./pages/AgendarMensagem";
import MensagensPredefinidas from "./pages/MensagensPredefinidas";
import MensagensEnviadas from "./pages/MensagensEnviadas";
import AssistenteIA from "./pages/AssistenteIA";
import AvaliacaoFisica from "./pages/AvaliacaoFisica";
import AgendarAvaliacao from "./pages/AgendarAvaliacao";
import WhatsApp from "./pages/WhatsApp";
import Automacoes from "./pages/Automacoes";
import NotFound from "./pages/NotFound";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog";
import { GlobalNotifier } from "@/components/layout/GlobalNotifier";

const queryClient = new QueryClient();

const Private = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <AppLayout>{children}</AppLayout>
  </ProtectedRoute>
);

const AuthedGlobalNotifier = () => {
  const { session } = require("@/hooks/useAuth").useAuth();
  return session ? <GlobalNotifier /> : null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="system" storageKey="workout-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ConfirmDialogHost />
        <BrowserRouter>
          <AuthProvider>
            <AuthedGlobalNotifier />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Private><Dashboard /></Private>} />
              <Route path="/alunos" element={<Private><Alunos /></Private>} />
              <Route path="/cadastrar-aluno" element={<Private><CadastrarAluno /></Private>} />
              <Route path="/agendar-mensagem" element={<Private><AgendarMensagem /></Private>} />
              <Route path="/whatsapp" element={<Private><WhatsApp /></Private>} />
              <Route path="/enviar-mensagem" element={<Private><EnviarMensagem /></Private>} />
              <Route path="/mensagens-agendadas" element={<Private><MensagensAgendadas /></Private>} />
              <Route path="/mensagens-predefinidas" element={<Private><MensagensPredefinidas /></Private>} />
              <Route path="/mensagens-enviadas" element={<Private><MensagensEnviadas /></Private>} />
              <Route path="/assistente-ia" element={<Private><AssistenteIA /></Private>} />
              <Route path="/avaliacao-fisica" element={<Private><AvaliacaoFisica /></Private>} />
              <Route path="/agendar-avaliacao" element={<Private><AgendarAvaliacao /></Private>} />
              <Route path="/automacoes" element={<Private><Automacoes /></Private>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
