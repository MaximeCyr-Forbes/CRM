import { PrivateRouteLayout } from "../components/private-route-layout";

export const dynamic = "force-dynamic";

export default function PipelineLayout({ children }: { children: React.ReactNode }) {
  return <PrivateRouteLayout>{children}</PrivateRouteLayout>;
}
