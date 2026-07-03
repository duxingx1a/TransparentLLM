"use client";

import ProtectedLayout from "@/components/layout/ProtectedLayout";

export default function ProvidersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
