
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";

const chartData = [
  { month: "Jan", messages: 45, students: 12 },
  { month: "Fev", messages: 52, students: 8 },
  { month: "Mar", messages: 48, students: 15 },
  { month: "Abr", messages: 61, students: 20 },
  { month: "Mai", messages: 55, students: 18 },
  { month: "Jun", messages: 67, students: 22 },
];

const chartConfig = {
  messages: {
    label: "Mensagens",
    color: "hsl(var(--primary))",
  },
  students: {
    label: "Novos Alunos",
    color: "hsl(var(--secondary))",
  },
};

export function ActivityChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Atividade dos Últimos 6 Meses</CardTitle>
        <CardDescription>
          Mensagens enviadas e novos alunos cadastrados
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[200px]">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <XAxis dataKey="month" />
            <YAxis />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="messages" fill="var(--color-messages)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="students" fill="var(--color-students)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
