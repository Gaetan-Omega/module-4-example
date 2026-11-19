import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { SiteHeader } from "@/components/copper/site-header";
import { RefundConsole } from "@/components/copper/refund-console";
import { SignInForm } from "@/components/copper/admin-sign-in";
import { Button } from "@/components/ui/button";
import {
  decideAdminRequest,
  loadAdminConsole,
  saveAdminLimit,
  signOut,
} from "@/app/admin/actions";
import { adminConfigured, isAdmin } from "@/lib/copper/refunds/admin-auth";

export const metadata: Metadata = { title: "Admin | Copper State Labs" };

export default function Admin() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="font-display text-3xl font-bold">Refund admin</h1>
        <Suspense
          fallback={
            <p className="text-muted-foreground mt-4 text-sm">Loading…</p>
          }
        >
          <AdminGate />
        </Suspense>
      </main>
    </div>
  );
}

// Depends on the visitor's cookie, so it renders per request, never prerendered.
async function AdminGate() {
  await connection();
  if (!adminConfigured())
    return (
      <p className="bg-card mt-4 rounded-xl border p-4 text-sm">
        Admin sign-in isn&apos;t set up. Set ADMIN_PASSWORD and
        ADMIN_SESSION_SECRET to use this page.
      </p>
    );
  if (!(await isAdmin())) return <SignInForm />;
  return (
    <div className="mt-4 space-y-6">
      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm">
          Sign out
        </Button>
      </form>
      <RefundConsole
        detailed
        actions={{
          load: loadAdminConsole,
          decide: decideAdminRequest,
          saveLimit: saveAdminLimit,
        }}
      />
    </div>
  );
}
