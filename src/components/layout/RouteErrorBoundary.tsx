import { Component, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageImportError } from "@/lib/lazyPage";

type Props = { children: ReactNode; resetKey: string; onReload?: () => void };

class PageBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const importFailure = this.state.error instanceof PageImportError;
    return (
      <main role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold">{importFailure ? "Não foi possível abrir esta tela" : "Esta página encontrou um erro"}</h1>
        <p className="max-w-lg text-muted-foreground">{importFailure
          ? "Uma atualização ou falha de conexão pode ter impedido o carregamento. Recarregue para tentar novamente."
          : "Recarregue a página para tentar novamente. Se o problema continuar, informe a administração."}</p>
        <p className="max-w-lg text-sm text-muted-foreground">Ao recarregar, dados de formulários ainda não salvos podem ser perdidos.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={this.props.onReload ?? (() => window.location.reload())}>Recarregar página</Button>
          <Button variant="outline" asChild><Link to="/">Voltar ao início</Link></Button>
        </div>
      </main>
    );
  }
}

/** A failed route does not poison navigation to another screen. Never reload in a loop. */
export function RouteErrorBoundary({ children, onReload }: { children: ReactNode; onReload?: () => void }) {
  const location = useLocation();
  return <PageBoundary resetKey={location.pathname + location.search} onReload={onReload}>{children}</PageBoundary>;
}
