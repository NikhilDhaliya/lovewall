// Runs in <head> before the first paint (inlined by the root layout), so the chosen theme is there from frame one.
// Its sha256 is allowed by the CSP (src/lib/csp.ts), so it needs no nonce and static pages stay static.
export const THEME_KEY = "lovewall-theme";

export const THEME_BOOT = `(function(){var r=document.documentElement,p="system";try{p=localStorage.getItem("${THEME_KEY}")||"system"}catch(e){}var d=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);r.dataset.theme=d?"dark":"light";r.dataset.themePref=p})()`;
