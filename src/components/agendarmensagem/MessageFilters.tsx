
import { Search, Calendar, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Student {
  id: string;
  name: string;
  phone: string;
}

interface MessageFiltersProps {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  dateFilter: string;
  setDateFilter: (value: string) => void;
  customDateRange: { from?: Date; to?: Date };
  setCustomDateRange: (range: { from?: Date; to?: Date }) => void;
  students: Student[];
  selectedStudents: string[];
  setSelectedStudents: (students: string[]) => void;
}

export default function MessageFilters({
  searchTerm,
  setSearchTerm,
  dateFilter,
  setDateFilter,
  customDateRange,
  setCustomDateRange,
  students,
  selectedStudents,
  setSelectedStudents
}: MessageFiltersProps) {
  const handleStudentToggle = (studentId: string) => {
    setSelectedStudents(
      selectedStudents.includes(studentId)
        ? selectedStudents.filter(id => id !== studentId)
        : [...selectedStudents, studentId]
    );
  };

  const selectedStudentsNames = students
    .filter(student => selectedStudents.includes(student.id))
    .map(student => student.name);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por mensagem, nome do aluno ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os períodos</SelectItem>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="this-month">Este mês</SelectItem>
              <SelectItem value="custom">Período personalizado</SelectItem>
            </SelectContent>
          </Select>
          
          {dateFilter === "custom" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto">
                  <Calendar className="mr-2 h-4 w-4" />
                  {customDateRange.from ? (
                    customDateRange.to ? (
                      <>
                        {format(customDateRange.from, "dd/MM/yyyy", { locale: ptBR })} -{" "}
                        {format(customDateRange.to, "dd/MM/yyyy", { locale: ptBR })}
                      </>
                    ) : (
                      format(customDateRange.from, "dd/MM/yyyy", { locale: ptBR })
                    )
                  ) : (
                    "Selecionar período"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  initialFocus
                  mode="range"
                  defaultMonth={customDateRange.from}
                  selected={{ from: customDateRange.from, to: customDateRange.to }}
                  onSelect={(range) => setCustomDateRange(range || {})}
                  numberOfMonths={2}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* Filtro de Alunos */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto justify-start">
              <Users className="mr-2 h-4 w-4" />
              {selectedStudents.length === 0 
                ? "Todos os alunos" 
                : selectedStudents.length === 1
                ? selectedStudentsNames[0]
                : `${selectedStudents.length} alunos selecionados`
              }
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" align="start">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Filtrar por alunos</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedStudents([])}
                >
                  Limpar
                </Button>
              </div>
              
              <div className="max-h-64 overflow-y-auto space-y-2">
                {students.map((student) => (
                  <div 
                    key={student.id} 
                    className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleStudentToggle(student.id)}
                  >
                    <Checkbox
                      id={student.id}
                      checked={selectedStudents.includes(student.id)}
                      onChange={() => {}} // Controlled by parent div click
                      className="pointer-events-none"
                    />
                    <label
                      htmlFor={student.id}
                      className="text-sm font-medium leading-none flex-1 cursor-pointer select-none"
                    >
                      {student.name} - {student.phone}
                    </label>
                  </div>
                ))}
              </div>
              
              {students.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum aluno encontrado
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
