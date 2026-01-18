import SignInButton from "./signin-button";

export default function SignInPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Sign in</h1>
      <p style={{ marginTop: 8 }}>Use GitHub to continue.</p>
      <div style={{ marginTop: 16 }}>
        <SignInButton />
      </div>
    </main>
  );
}
