
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/providers/theme-provider";
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
import AvaliacaoFisica from "./pages/AvaliacaoFisica";
import AgendarAvaliacao from "./pages/AgendarAvaliacao";
import WhatsApp from "./pages/WhatsApp";
import { Navigate } from "react-router-dom";
import NotFound from "./pages/NotFound";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog";
import { GlobalNotifier } from "@/components/layout/GlobalNotifier";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="system" storageKey="workout-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ConfirmDialogHost />
        <BrowserRouter>
          <GlobalNotifier />

          <Routes>
            <Route path="/" element={
              <AppLayout>
                <Dashboard />
              </AppLayout>
            } />
            <Route path="/alunos" element={
              <AppLayout>
                <Alunos />
              </AppLayout>
            } />
            <Route path="/cadastrar-aluno" element={
              <AppLayout>
                <CadastrarAluno />
              </AppLayout>
            } />
            <Route path="/agendar-mensagem" element={
              <AppLayout>
                <AgendarMensagem />
              </AppLayout>
            } />
            <Route path="/whatsapp" element={
              <AppLayout>
                <WhatsApp />
              </AppLayout>
            } />
            <Route path="/enviar-mensagem" element={
              <AppLayout>
                <EnviarMensagem />
              </AppLayout>
            } />
            <Route path="/mensagens-agendadas" element={
              <AppLayout>
                <MensagensAgendadas />
              </AppLayout>
            } />
            <Route path="/mensagens-predefinidas" element={
              <AppLayout>
                <MensagensPredefinidas />
              </AppLayout>
            } />
            <Route path="/mensagens-enviadas" element={
              <AppLayout>
                <MensagensEnviadas />
              </AppLayout>
            } />
            <Route path="/assistente-ia" element={
              <AppLayout>
                <AssistenteIA />
              </AppLayout>
            } />
            <Route path="/avaliacao-fisica" element={
              <AppLayout>
                <AvaliacaoFisica />
              </AppLayout>
            } />
            <Route path="/agendar-avaliacao" element={
              <AppLayout>
                <AgendarAvaliacao />
              </AppLayout>
            } />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
