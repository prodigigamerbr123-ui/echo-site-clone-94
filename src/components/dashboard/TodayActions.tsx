
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, MessageCircle, Loader2, Cake, ClipboardList, Dumbbell, Sparkles } from "lucide-react";
import { useTodayActions } from "@/hooks/useDashboardData";
import { useToast } from "@/hooks/use-toast";

interface TodayAction {
  id: string;
  name: string;
  phone: string;
  action: string;
  type: "birthday" | "evaluation" | "daqui_7_dias" | "daqui_21_dias";
}

export function TodayActions() {
  const { data: todayActions = [], isLoading: actionsLoading } = useTodayActions();
  const { toast } = useToast();

  const getActionBadge = (type: string) => {
    switch (type) {
      case "birthday":
        return (
          <Badge className="bg-primary text-primary-foreground gap-1">
            <Cake className="h-3 w-3" /> Aniversário
          </Badge>
        );
      case "evaluation":
        return (
          <Badge variant="destructive" className="gap-1">
            <ClipboardList className="h-3 w-3" /> Avaliação
          </Badge>
        );
      case "daqui_7_dias":
        return (
          <Badge className="bg-success text-success-foreground gap-1">
            <Dumbbell className="h-3 w-3" /> Daqui 7 dias
          </Badge>
        );
      case "daqui_21_dias":
        return (
          <Badge className="bg-warning text-warning-foreground gap-1">
            <Sparkles className="h-3 w-3" /> Daqui 21 dias
          </Badge>
        );
      default:
        return <Badge variant="secondary">Ação</Badge>;
    }
  };

  const formatPhoneForWhatsApp = (phone: string) => {
    const numbers = phone.replace(/\D/g, '');
    
    if (numbers.length === 11) {
      return `55${numbers}`;
    } else if (numbers.length === 10) {
      return `55${numbers}`;
    }
    
    return numbers;
  };

  const getMessageForAction = (action: TodayAction) => {
    switch (action.type) {
      case "birthday":
        return `🎉 Parabéns, ${action.name}! Feliz aniversário! 🎂\n\nDesejamos um dia repleto de alegrias e um ano cheio de conquistas!\n\nEquipe Academia Workout 💪`;
      case "evaluation":
        if (action.action.includes("Primeira")) {
          return `Olá ${action.name}! 😊\n\nNotamos que você ainda não fez sua avaliação física. Que tal agendarmos?\n\nA avaliação é super importante para acompanharmos sua evolução! 📊\n\nAcademia Workout 💪`;
        } else {
          return `Oi ${action.name}! 😊\n\nSua avaliação física está vencida. Que tal agendarmos uma nova?\n\nVamos acompanhar sua evolução juntos! 📈\n\nAcademia Workout 💪`;
        }
      case "daqui_7_dias":
        return `Olá ${action.name}! 💪\n\nComo foi sua primeira semana na academia? Está conseguindo manter a rotina de exercícios?\n\nQualquer dúvida, estamos aqui para ajudar! 🏋️‍♂️\n\nAcademia Workout`;
      case "daqui_21_dias":
        return `Oi ${action.name}! 💪\n\nJá se passaram 3 semanas desde que você começou na academia! Como está se sentindo?\n\nNotou alguma mudança? Continue firme nos treinos!\n\nEstamos aqui para te apoiar! 🏋️‍♂️\n\nAcademia Workout`;
      default:
        return `Olá ${action.name}! Como você está? A Academia Workout está aqui para te apoiar! 💪`;
    }
  };

  const handleSendWhatsApp = (action: TodayAction) => {
    try {
      const formattedPhone = formatPhoneForWhatsApp(action.phone);
      const message = getMessageForAction(action);
      const encodedMessage = encodeURIComponent(message);
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodedMessage}`;
      
      window.open(whatsappUrl, '_blank');
      
      toast({
        title: "WhatsApp aberto!",
        description: `Mensagem preparada para ${action.name}`,
      });
    } catch (error) {
      console.error('Error opening WhatsApp:', error);
      toast({
        title: "Erro ao abrir WhatsApp",
        description: "Tente novamente em alguns instantes.",
        variant: "destructive"
      });
    }
  };

  const handleDelay = (action: TodayAction) => {
    toast({
      title: "Ação adiada",
      description: `Mensagem para ${action.name} foi adiada`,
    });
  };

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="text-xl">Pra quem mandar mensagem hoje?</CardTitle>
        <CardDescription>
          Alunos que precisam receber mensagens hoje
        </CardDescription>
      </CardHeader>
      <CardContent>
        {actionsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Carregando ações...</span>
          </div>
        ) : todayActions.length > 0 ? (
          <div className="space-y-4">
            {todayActions.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-medium text-foreground">{item.name}</h4>
                    {getActionBadge(item.type)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    {item.phone}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{item.action}</p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleDelay(item)}
                  >
                    Adiar
                  </Button>
                  <Button 
                    size="sm"
                    onClick={() => handleSendWhatsApp(item)}
                  >
                    Enviar Agora
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma ação programada para hoje</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
