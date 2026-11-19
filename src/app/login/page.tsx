import { Logo } from "@/components/logo";
import { LoginForm } from "@/features/auth/login-form";

export default function LoginPage() {
    return (
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
            <h1>
                <Logo className="h-auto w-full" />
            </h1>
            <LoginForm demo={process.env.DEMO_MODE === "1"} />
        </main>
    );
}
