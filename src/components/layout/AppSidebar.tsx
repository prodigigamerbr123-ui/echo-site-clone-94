import { NavLink, useLocation } from "react-router-dom";

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
  Zap,
  Settings,
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
      { title: "Conexão WhatsApp", url: "/whatsapp", icon: MessageCircle },
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Alunos", url: "/alunos", icon: Users },
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
      { title: "Mensagens", url: "/mensagens", icon: Send },
      { title: "Caixa de saída", url: "/caixa-de-saida", icon: CalendarClock },
      { title: "Pré-definidas", url: "/mensagens-predefinidas", icon: FileText },
    ],
  },
  {
    label: "Inteligência",
    items: [
      { title: "Assistente IA", url: "/assistente-ia", icon: Bot },
    ],
  },
  {
    label: "Manutenção",
    items: [
      { title: "Automações", url: "/automacoes", icon: Zap },
      { title: "Configurações", url: "/configuracoes", icon: Settings },
    ],
  },
];


export function AppSidebar() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

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
