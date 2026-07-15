
import { NavLink, useLocation } from "react-router-dom";
import {
  Users,
  UserPlus,
  Clock,
  FileText,
  Send,
  LayoutDashboard,
  Bot,
  Mail,
  CalendarClock,
  HeartPulse,
  Activity,
} from "lucide-react";

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
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Cadastrar Aluno", url: "/cadastrar-aluno", icon: UserPlus },
      { title: "Ver Alunos", url: "/alunos", icon: Users },
    ],
  },
  {
    label: "Avaliação Física",
    items: [
      { title: "Visão Geral", url: "/avaliacao-fisica", icon: Activity },
      { title: "Agendar Avaliação Física", url: "/agendar-avaliacao", icon: CalendarPlus },
    ],
  },
  {
    label: "Mensagens",
    items: [
      { title: "Envio Manual", url: "/enviar-mensagem", icon: Send },
      { title: "Agendar Mensagem", url: "/agendar-mensagem", icon: Clock },
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
  const currentPath = location.pathname;
  
  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarContent>
        {menuGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
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
                        <span>{item.title}</span>
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
