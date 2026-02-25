-- AlterTable: add providerInvoiceId to BillingTransaction (Paddle invoice_id from transaction.completed).
ALTER TABLE "BillingTransaction" ADD COLUMN IF NOT EXISTS "providerInvoiceId" VARCHAR(191);
