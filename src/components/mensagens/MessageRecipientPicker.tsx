import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Student } from "@/lib/messageRecipients";
import { Search, Users } from "lucide-react";

interface Props {
  filteredStudents: Student[];
  selectedStudents: string[];
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  allVisibleSelected: boolean;
  handleSelectAll: () => void;
  handleStudentToggle: (id: string) => void;
}

export function MessageRecipientPicker({ filteredStudents, selectedStudents, searchTerm, setSearchTerm, allVisibleSelected, handleSelectAll, handleStudentToggle }: Props) {
  return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Selecionar Alunos ({selectedStudents.length})
            </CardTitle>
            <div className="flex gap-2 pt-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              <Button variant="outline" onClick={handleSelectAll} className="shrink-0">
                {allVisibleSelected ? "Desmarcar" : "Todos"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {filteredStudents.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum aluno.</p>
            ) : (
              filteredStudents.map(s => (
                <div
                  key={s.id}
                  className={`flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer ${
                    selectedStudents.includes(s.id) ? "bg-accent/50 border-primary/50" : "border-border"
                  }`}
                  onClick={() => handleStudentToggle(s.id)}
                >
                  <Checkbox checked={selectedStudents.includes(s.id)} className="pointer-events-none" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{s.name}</p>
                    <p className="text-sm text-muted-foreground">{s.phone}</p>
                  </div>
                  {s.had_evaluation && <Badge variant="secondary" className="text-xs">Avaliado</Badge>}
                </div>
              ))
            )}
          </CardContent>
        </Card>
  );
}
