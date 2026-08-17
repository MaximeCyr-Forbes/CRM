import { PrivateRouteLayout } from "./components/private-route-layout";
import { SelectionPage } from "./selection-page";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <PrivateRouteLayout>
      <SelectionPage />
    </PrivateRouteLayout>
  );
}
