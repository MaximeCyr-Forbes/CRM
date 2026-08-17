"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { DataStatus } from "../../components/data-status";

export default function LegacyClientProfile() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/contacts/${params.clientId}`);
  }, [params.clientId, router]);

  return (
    <main className="client-page">
      <div className="profile-shell"><DataStatus /></div>
    </main>
  );
}
