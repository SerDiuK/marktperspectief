export function Money({ children }: { children: React.ReactNode }) {
    return <span className="transition private:blur-money">{children}</span>;
}
