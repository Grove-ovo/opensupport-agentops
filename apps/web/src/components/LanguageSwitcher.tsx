import { Globe } from 'lucide-react';
import { useLocale } from '../locales/index.js';

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const toggle = () => setLocale(locale === 'en' ? 'zh' : 'en');
  return (
    <button
      className="icon-button language-switcher"
      type="button"
      onClick={toggle}
      title={locale === 'en' ? '切换到中文' : 'Switch to English'}
      aria-label="Language"
    >
      <Globe size={17} />
      <span>{locale === 'en' ? '中文' : 'EN'}</span>
    </button>
  );
}