export {};

declare global {
  interface Window {
    ethereum?: {
      request(args: {
        method: string;
        params?: unknown[] | object;
      }): Promise<unknown>;
      on?(event: "accountsChanged", listener: (accounts: string[]) => void): void;
      removeListener?(
        event: "accountsChanged",
        listener: (accounts: string[]) => void,
      ): void;
    };
  }
}
