import SignInForm from "./signin-form";

export default function SignInPage() {
  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <h1>Sign in</h1>
      <p style={{ marginTop: 8 }}>No password required.</p>

      <div style={{ marginTop: 16 }}>
        <SignInForm />
      </div>
    </main>
  );
}
