/** Never include emails, passwords, OAuth codes or tokens in application logs. */
export function authEvent(event: string) { console.info('[CRM_AUTH]', event); }
