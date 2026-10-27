import { useSidebar } from "@/components/ui/sidebar-context";
import { useAuth } from "@/hooks/useAuth";
import { canVisit } from "@/lib/staffRoles";
import { useWhatsAppHealth } from "@/hooks/useWhatsAppHealth";
import { NavLink, useLocation } from "react-router-dom";

import {
  Bot,
  CalendarClock,
  CalendarPlus,
  FileText,
  History,
  LayoutDashboard,
  MessageCircle,
  Send,
  Settings,
  Users,
  Zap,
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

// Rotina primeiro; conexão e manutenção no fim, com o status do WhatsApp visível no próprio item.
const menuGroups = [
  {
    label: "Principal",
    items: [
      { title: "Início", url: "/", icon: LayoutDashboard },
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
    label: "Ferramentas",
    items: [
      { title: "Assistente IA", url: "/assistente-ia", icon: Bot },
    ],
  },
  {
    label: "Manutenção",
    items: [
      { title: "Conexão WhatsApp", url: "/whatsapp", icon: MessageCircle },
      { title: "Automações", url: "/automacoes", icon: Zap },
      { title: "Configurações", url: "/configuracoes", icon: Settings },
    ],
  },
];

function WhatsAppDot() {
  const { connected, disconnected, state } = useWhatsAppHealth();
  const [tone, label] = connected ? ["bg-success", "conectado"]
    : disconnected ? ["bg-destructive", "desconectado"]
      : state === undefined ? ["bg-muted-foreground/40", "verificando"] : ["bg-amber-500", "não confirmado"];
  return <>
    <span aria-hidden className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-sidebar ${tone}`} />
    <span className="sr-only">Status: {label}</span>
  </>;
}

export function AppSidebar() {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  const { role } = useAuth();
  const previewMode = import.meta.env.VITE_PREVIEW_MODE === "true";
  const isActive = (path: string) => location.pathname === path;
  const visibleGroups = menuGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => previewMode || canVisit(role, item.url)),
  })).filter((group) => group.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarContent>
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        onClick={() => setOpenMobile(false)}
                        end
                        className={
                          isActive(item.url)
                            ? "bg-primary text-primary-foreground font-medium"
                            : "text-foreground"
                        }
                      >
                        <span className="relative shrink-0">
                          <item.icon className="h-4 w-4" />
                          {item.url === "/whatsapp" && <WhatsAppDot />}
                        </span>
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
