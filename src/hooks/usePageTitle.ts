import { useEffect } from "react";

const DEFAULT_TITLE = "WorkOut · Sistema de Mensagens";

/**
 * Define o document.title da rota atual e restaura o padrão ao desmontar.
 * Ex.: usePageTitle("Alunos") -> "Alunos · WorkOut"
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · WorkOut` : DEFAULT_TITLE;
    return () => {
      document.title = previous || DEFAULT_TITLE;
    };
  }, [title]);
}
