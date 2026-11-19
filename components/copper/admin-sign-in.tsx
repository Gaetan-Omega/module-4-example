"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/app/admin/actions";

export function SignInForm() {
  const [error, formAction, pending] = useActionState(signIn, "");
  return (
    <form action={formAction} className="mt-4 flex max-w-sm flex-col gap-3">
      <label htmlFor="admin-password" className="text-sm font-medium">
        Admin password
      </label>
      <Input
        id="admin-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {error && (
        <p role="alert" className="text-chart-3 text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Sign in
      </Button>
    </form>
  );
}
