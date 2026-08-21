import type { ReactNode } from "react";
import { PrivateRouteLayout } from "../components/private-route-layout";

export const dynamic = "force-dynamic";

export default function CalendarLayout({ children }: { children: ReactNode }) {
  return <PrivateRouteLayout>{children}</PrivateRouteLayout>;
}
