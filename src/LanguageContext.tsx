import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Language, t as translateFn } from './i18n';

interface LanguageContextProps {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: keyof typeof import('./i18n').translations.en) => string;
}

const LanguageContext = createContext<LanguageContextProps>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key as string,
});

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLang] = useState<Language>('en');

  const t = (key: keyof typeof import('./i18n').translations.en) => {
    return translateFn(lang, key);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
