interface ConfirmOpts {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

export interface State extends ConfirmOpts {
  open: boolean;
  resolve?: (v: boolean) => void;
}

export const listeners = new Set<(s: State) => void>();
export let current: State = { open: false, title: "" };
export const setState = (s: State) => { current = s; listeners.forEach((l) => l(s)); };

export const confirm = (opts: ConfirmOpts): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    setState({ open: true, ...opts, resolve });
  });

export const useConfirm = () => confirm;
