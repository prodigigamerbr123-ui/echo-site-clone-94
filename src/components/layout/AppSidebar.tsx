import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  UserPlus,
  FileText,
  Send,
  LayoutDashboard,
  Bot,
  Mail,
  CalendarClock,
  History,
  CalendarPlus,
  MessageCircle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const menuGroups = [
  {
    label: "Principal",
    items: [
      { title: "Conexão WhatsApp", url: "/whatsapp", icon: MessageCircle },
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Alunos", url: "/alunos", icon: Users },
      { title: "Cadastrar Aluno", url: "/cadastrar-aluno", icon: UserPlus },
    ],
  },
  {
    label: "Avaliação Física",
    items: [
      { title: "Agenda de Avaliações", url: "/agendar-avaliacao", icon: CalendarPlus },
      { title: "Histórico de Avaliações", url: "/avaliacao-fisica", icon: History },
    ],
  },
  {
    label: "Mensagens",
    items: [
      { title: "Enviar Mensagem", url: "/enviar-mensagem", icon: Send },
      { title: "Mensagens Agendadas", url: "/mensagens-agendadas", icon: CalendarClock },
      { title: "Mensagens Enviadas", url: "/mensagens-enviadas", icon: Mail },
      { title: "Pré-definidas", url: "/mensagens-predefinidas", icon: FileText },
    ],
  },
  {
    label: "Inteligência",
    items: [{ title: "Assistente IA", url: "/assistente-ia", icon: Bot }],
  },
];


export function AppSidebar() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  const { data: wa } = useQuery({
    queryKey: ["whatsapp-sidebar-status"],
    queryFn: async () => {
      try {
        const { data } = await supabase.functions.invoke("whatsapp-status");
        return data as { connected?: boolean };
      } catch {
        return { connected: false };
      }
    },
    refetchInterval: 120000,
    staleTime: 60000,
  });

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarContent>
        {menuGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item: any) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        className={
                          isActive(item.url)
                            ? "bg-primary text-primary-foreground font-medium"
                            : "text-foreground"
                        }
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.title}</span>
                        {item.showStatus && (
                          <span
                            className={`h-2 w-2 rounded-full ${
                              wa?.connected ? "bg-green-500" : "bg-destructive"
                            }`}
                            title={wa?.connected ? "Conectado" : "Desconectado"}
                          />
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
