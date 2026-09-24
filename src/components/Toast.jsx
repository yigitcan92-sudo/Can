import { createContext, useCallback, useContext, useState } from 'react';

const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const toast = useCallback((text, tone = 'info') => {
    const id = Math.random();
    setItems((l) => [...l, { id, text, tone }]);
    setTimeout(() => setItems((l) => l.filter((i) => i.id !== id)), 4500);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toasts">
        {items.map((i) => (
          <div key={i.id} className={`toast ${i.tone}`}>
            {i.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
