import { Globe } from 'lucide-react';
import { useLocale } from '../locales/index.js';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  const toggle = () => setLocale(locale === 'en' ? 'zh' : 'en');
  return (
    <button
      className="icon-button language-switcher"
      type="button"
      onClick={toggle}
      title={locale === 'en' ? t('lang.switch.zh') : t('lang.switch.en')}
      aria-label={t('lang.switch.aria')}
    >
      <Globe size={17} />
      <span>{locale === 'en' ? t('lang.zh') : t('lang.en')}</span>
    </button>
  );
}
