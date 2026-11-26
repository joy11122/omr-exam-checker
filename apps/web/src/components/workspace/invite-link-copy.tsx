"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function InviteLinkCopy({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return <div className="invite-copy-row"><code>{url}</code><button type="button" className="button button-secondary" onClick={copyLink}><>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? "Copied" : "Copy link"}</></button></div>;
}
