import Link from "@/app/lib/tools/tool-link";
import type { ReactNode } from "react";
import "./acm.css";
export default function AcmLayout({children}: {children: ReactNode}) {return <div className="forbes-tool-acm"><nav className="acm-tool-nav" aria-label="Analyse comparative"><Link href="/logiciels/generateur-acm">Nouvelle ACM</Link><Link href="/logiciels/generateur-acm/analyses">Mes analyses</Link></nav>{children}</div>;}
