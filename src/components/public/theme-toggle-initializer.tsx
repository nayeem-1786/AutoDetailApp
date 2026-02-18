export function ThemeToggleInitializer() {
  const script = `
    (function() {
      try {
        var saved = localStorage.getItem('sd-user-theme');
        if (saved === 'light') {
          var el = document.querySelector('.public-theme');
          if (el) el.setAttribute('data-user-theme', 'light');
        }
      } catch(e) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
