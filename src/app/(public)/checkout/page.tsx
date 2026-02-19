import { Container } from "@/components/ui/container";
import { PaddleCheckoutHost } from "@/components/app/checkout/paddle-checkout-host";

/**
 * Paddle Checkout host page.
 *
 * Set this URL as the "Default payment link" in Paddle Dashboard (Checkout > Checkout settings).
 * Paddle will redirect customers here with ?_ptxn=txn_xxx; Paddle.js then opens the checkout overlay.
 *
 * Requires NEXT_PUBLIC_PADDLE_CLIENT_TOKEN (client-side token from Paddle > Developer tools > Authentication).
 */
export default function CheckoutPage() {
  const raw =
    typeof process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN === "string"
      ? process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
      : "";
  const clientToken = raw.trim() || null;

  return (
    <main className="min-h-screen bg-(--bg-main)">
      <Container className="py-12">
        <PaddleCheckoutHost clientToken={clientToken} />
      </Container>
    </main>
  );
}
