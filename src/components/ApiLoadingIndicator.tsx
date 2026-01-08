'use client';

import { css } from '@styled-system/css';
import { useApiLoading } from '@/contexts/ApiLoadingContext';

export default function ApiLoadingIndicator() {
  const { isLoading } = useApiLoading();

  if (!isLoading) {
    return null;
  }

  return (
    <>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
      
      <div className={css({
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        zIndex: 999,
        width: '40px',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(26, 26, 26, 0.9)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '50%',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.2s ease-out',
        sm: {
          bottom: '12px',
          right: '12px',
          width: '36px',
          height: '36px',
        },
      })}>
        <div className={css({
          width: '20px',
          height: '20px',
          border: '2px solid rgba(255, 255, 255, 0.2)',
          borderTopColor: '#2563eb',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          sm: {
            width: '18px',
            height: '18px',
          },
        })} />
      </div>
    </>
  );
}




















