"use client";
import { useRouter } from "next/navigation";
import type { AnchorHTMLAttributes } from "react";

// Use the CRM router directly; the deployed runtime does not support next/link prefetch.
export default function ToolLink({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const router = useRouter();
  return <a {...props} href={href} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (props.target && props.target !== "_self")) return;
    event.preventDefault();
    router.push(href);
  }} />;
}
