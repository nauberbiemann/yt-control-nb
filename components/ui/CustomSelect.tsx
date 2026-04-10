'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  icon?: React.ReactNode;
  className?: string;
}

export default function CustomSelect({ 
  value, 
  onChange, 
  options, 
  placeholder = 'Selecionar...', 
  icon,
  className = '' 
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl 
          bg-white/5 border transition-all duration-300 group
          ${isOpen ? 'border-sage/40 ring-1 ring-sage/20' : 'border-white/10 hover:border-white/20'}
          ${selectedOption ? 'text-white' : 'text-white/40'}
        `}
      >
        <div className="flex items-center gap-2 truncate">
          {icon && <span className="text-sage opacity-80">{icon}</span>}
          <span className="text-xs font-bold uppercase tracking-widest truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown 
          size={14} 
          className={`transition-transform duration-300 text-white/20 group-hover:text-white/40 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div 
          className="
            absolute left-0 right-0 top-full mt-2 z-[100] 
            bg-midnight/90 backdrop-blur-2xl border border-white/10 
            rounded-2xl shadow-2xl overflow-hidden
            animate-in fade-in zoom-in-95 duration-200
          "
        >
          <div className="max-h-60 overflow-y-auto py-2">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`
                  w-full flex items-center justify-between px-4 py-3 
                  text-left text-[11px] font-black uppercase tracking-widest
                  transition-all duration-200
                  ${value === option.value 
                    ? 'bg-sage/10 text-sage' 
                    : 'text-white/40 hover:bg-white/5 hover:text-white'}
                `}
              >
                <span>{option.label}</span>
                {value === option.value && <Check size={12} className="text-sage" />}
              </button>
            ))}
            {options.length === 0 && (
              <div className="px-4 py-4 text-center text-[10px] text-white/20 uppercase font-black tracking-widest">
                Nenhuma opção disponível
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
