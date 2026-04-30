
import { NavLink, useLocation } from "react-router-dom";
import {
  Users,
  Clock,
  MessageSquare,
  Send,
  BarChart3,
  Bot,
  MessageCircle,
  CalendarClock,
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

const menuItems = [
  { title: "WhatsApp", url: "/whatsapp", icon: MessageCircle },
  { title: "Dashboard", url: "/", icon: BarChart3 },
  { title: "Alunos", url: "/alunos", icon: Users },
  { title: "Agendar Mensagem", url: "/agendar-mensagem", icon: Clock },
  { title: "Mensagens Agendadas", url: "/mensagens-agendadas", icon: CalendarClock },
  { title: "Enviar Mensagem", url: "/enviar-mensagem", icon: Send },
  { title: "Mensagens Enviadas", url: "/mensagens-enviadas", icon: MessageCircle },
  { title: "Mensagens Pré-definidas", url: "/mensagens-predefinidas", icon: MessageSquare },
  { title: "Assistente IA", url: "/assistente-ia", icon: Bot },
];

export function AppSidebar() {
  const location = useLocation();
  const currentPath = location.pathname;
  
  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Gerenciar Academia</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url} 
                      end 
                      className={isActive(item.url) 
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
      </SidebarContent>
    </Sidebar>
  );
}
