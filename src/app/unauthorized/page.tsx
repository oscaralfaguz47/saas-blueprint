export default function UnauthorizedPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>403 – Unauthorized</h1>
      <p>You do not have permission to access this page.</p>
      <a href="/dashboard">Go back to dashboard</a>
    </main>
  );
}
