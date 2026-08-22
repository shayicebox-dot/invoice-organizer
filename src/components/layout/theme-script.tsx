/**
 * Applies the stored theme before first paint to avoid a flash of the wrong
 * theme. Runs as a blocking inline script — keep it tiny and dependency-free.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('icebox-os.theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
