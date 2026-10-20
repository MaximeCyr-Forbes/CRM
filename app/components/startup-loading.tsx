/** No private content or navigation before session/workspace resolution. */
export function StartupLoading() {
  return <div className="crm-startup-loading" role="status" aria-label="Ouverture du CRM" aria-busy="true">
    <img src="/branding/equipe-forbes-logo.png" alt="Équipe Forbes" width="196" height="27" />
  </div>;
}
