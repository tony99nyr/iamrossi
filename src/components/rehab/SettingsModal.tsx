'use client';

import { useState } from 'react';
import { css, cx } from '@styled-system/css';

interface Vitamin {
  name: string;
  dosage: string;
  frequency: string;
}

interface ProteinShakeIngredient {
  name: string;
  amount: string;
}

interface RehabSettings {
  vitamins: Vitamin[];
  proteinShake: {
    ingredients: ProteinShakeIngredient[];
    servingSize: string;
  };
}

interface SettingsModalProps {
  settings: RehabSettings;
  onSave: (settings: RehabSettings) => void;
  onClose: () => void;
}

type Tab = 'vitamins' | 'protein';

export default function SettingsModal({ settings, onSave, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('vitamins');
  const [vitamins, setVitamins] = useState<Vitamin[]>(settings.vitamins || []);
  const [proteinIngredients, setProteinIngredients] = useState<ProteinShakeIngredient[]>(
    settings.proteinShake?.ingredients || []
  );
  const [servingSize, setServingSize] = useState(settings.proteinShake?.servingSize || '');

  const handleAddVitamin = () => {
    setVitamins([...vitamins, { name: '', dosage: '', frequency: 'Daily' }]);
  };

  const handleUpdateVitamin = (index: number, field: keyof Vitamin, value: string) => {
    const updated = [...vitamins];
    updated[index] = { ...updated[index], [field]: value };
    setVitamins(updated);
  };

  const handleRemoveVitamin = (index: number) => {
    setVitamins(vitamins.filter((_, i) => i !== index));
  };

  const handleAddIngredient = () => {
    setProteinIngredients([...proteinIngredients, { name: '', amount: '' }]);
  };

  const handleUpdateIngredient = (index: number, field: keyof ProteinShakeIngredient, value: string) => {
    const updated = [...proteinIngredients];
    updated[index] = { ...updated[index], [field]: value };
    setProteinIngredients(updated);
  };

  const handleRemoveIngredient = (index: number) => {
    setProteinIngredients(proteinIngredients.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave({
      vitamins,
      proteinShake: {
        ingredients: proteinIngredients,
        servingSize,
      },
    });
    onClose();
  };

  return (
    <div className={cx('settings-modal', css({
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      zIndex: 100,
      display: 'flex',
      alignItems: 'flex-end',
      md: {
        alignItems: 'center',
        justifyContent: 'center',
      }
    }))}>
      <div className={cx('modal-container', css({
        backgroundColor: '#0a0a0a',
        width: '100%',
        maxWidth: '600px',
        borderRadius: '16px 16px 0 0',
        padding: '24px',
        maxHeight: '90vh',
        overflowY: 'auto',
        position: 'relative',
        md: {
          borderRadius: '16px',
        }
      }))}>
        {/* Close Button */}
        <button
          onClick={onClose}
          className={cx('close-btn', css({
            position: 'absolute',
            top: '16px',
            right: '16px',
            backgroundColor: 'transparent',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.6)',
            fontSize: '28px',
            cursor: 'pointer',
            padding: '4px 8px',
            lineHeight: '1',
            transition: 'all 0.2s ease',
            _hover: {
              color: '#fff',
              transform: 'scale(1.1)',
            },
          }))}
        >
          ✕
        </button>

        {/* Header */}
        <h2 className={css({
          color: '#ededed',
          fontSize: '22px',
          fontWeight: '600',
          marginBottom: '24px',
        })}>
          Settings
        </h2>

        {/* Tabs */}
        <div className={css({
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          borderBottom: '1px solid #333',
        })}>
          <button
            onClick={() => setActiveTab('vitamins')}
            className={css({
              padding: '12px 24px',
              backgroundColor: 'transparent',
              border: 'none',
              color: activeTab === 'vitamins' ? '#2563eb' : '#999',
              fontSize: '16px',
              fontWeight: '500',
              cursor: 'pointer',
              borderBottom: activeTab === 'vitamins' ? '2px solid #2563eb' : '2px solid transparent',
              transition: 'all 0.2s ease',
              _hover: {
                color: '#ededed',
              }
            })}
          >
            💊 Vitamins
          </button>
          <button
            onClick={() => setActiveTab('protein')}
            className={css({
              padding: '12px 24px',
              backgroundColor: 'transparent',
              border: 'none',
              color: activeTab === 'protein' ? '#2563eb' : '#999',
              fontSize: '16px',
              fontWeight: '500',
              cursor: 'pointer',
              borderBottom: activeTab === 'protein' ? '2px solid #2563eb' : '2px solid transparent',
              transition: 'all 0.2s ease',
              _hover: {
                color: '#ededed',
              }
            })}
          >
            🥤 Protein Shake
          </button>
        </div>

        {/* Vitamins Tab */}
        {activeTab === 'vitamins' && (
          <div className={css({ display: 'flex', flexDirection: 'column', gap: '16px' })}>
            {vitamins.map((vitamin, index) => (
              <div key={index} className={css({
                backgroundColor: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              })}>
                <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
                  <span className={css({ color: '#999', fontSize: '14px', fontWeight: '500' })}>
                    Vitamin #{index + 1}
                  </span>
                  <button
                    onClick={() => handleRemoveVitamin(index)}
                    className={css({
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#ef4444',
                      fontSize: '20px',
                      cursor: 'pointer',
                      padding: '4px',
                      _hover: { color: '#dc2626' }
                    })}
                  >
                    ×
                  </button>
                </div>
                
                <input
                  type="text"
                  value={vitamin.name}
                  onChange={(e) => handleUpdateVitamin(index, 'name', e.target.value)}
                  placeholder="Vitamin name (e.g., Vitamin D3)"
                  className={css({
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    color: '#ededed',
                    fontSize: '15px',
                    padding: '10px 12px',
                    outline: 'none',
                    _focus: { borderColor: '#2563eb' }
                  })}
                />
                
                <div className={css({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' })}>
                  <input
                    type="text"
                    value={vitamin.dosage}
                    onChange={(e) => handleUpdateVitamin(index, 'dosage', e.target.value)}
                    placeholder="Dosage (e.g., 5000 IU)"
                    className={css({
                      backgroundColor: '#0a0a0a',
                      border: '1px solid #333',
                      borderRadius: '4px',
                      color: '#ededed',
                      fontSize: '15px',
                      padding: '10px 12px',
                      outline: 'none',
                      _focus: { borderColor: '#2563eb' }
                    })}
                  />
                  
                  <select
                    value={vitamin.frequency}
                    onChange={(e) => handleUpdateVitamin(index, 'frequency', e.target.value)}
                    className={css({
                      backgroundColor: '#0a0a0a',
                      border: '1px solid #333',
                      borderRadius: '4px',
                      color: '#ededed',
                      fontSize: '15px',
                      padding: '10px 12px',
                      outline: 'none',
                      _focus: { borderColor: '#2563eb' }
                    })}
                  >
                    <option value="Daily">Daily</option>
                    <option value="Twice daily">Twice daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="As needed">As needed</option>
                  </select>
                </div>
              </div>
            ))}
            
            <button
              onClick={handleAddVitamin}
              className={css({
                padding: '12px',
                backgroundColor: 'transparent',
                border: '1px dashed #333',
                borderRadius: '8px',
                color: '#2563eb',
                fontSize: '15px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                _hover: {
                  borderColor: '#2563eb',
                  backgroundColor: 'rgba(37, 99, 235, 0.1)',
                }
              })}
            >
              + Add Vitamin
            </button>
          </div>
        )}

        {/* Protein Shake Tab */}
        {activeTab === 'protein' && (
          <div className={css({ display: 'flex', flexDirection: 'column', gap: '16px' })}>
            <div className={css({ marginBottom: '8px' })}>
              <label className={css({ color: '#999', fontSize: '14px', fontWeight: '500', marginBottom: '8px', display: 'block' })}>
                Serving Size
              </label>
              <input
                type="text"
                value={servingSize}
                onChange={(e) => setServingSize(e.target.value)}
                placeholder="e.g., 16 oz"
                className={css({
                  width: '100%',
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  color: '#ededed',
                  fontSize: '15px',
                  padding: '10px 12px',
                  outline: 'none',
                  _focus: { borderColor: '#2563eb' }
                })}
              />
            </div>

            <div className={css({ color: '#999', fontSize: '14px', fontWeight: '500', marginTop: '8px' })}>
              Ingredients
            </div>

            {proteinIngredients.map((ingredient, index) => (
              <div key={index} className={css({
                backgroundColor: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
              })}>
                <input
                  type="text"
                  value={ingredient.name}
                  onChange={(e) => handleUpdateIngredient(index, 'name', e.target.value)}
                  placeholder="Ingredient name"
                  className={css({
                    flex: 1,
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    color: '#ededed',
                    fontSize: '15px',
                    padding: '10px 12px',
                    outline: 'none',
                    _focus: { borderColor: '#2563eb' }
                  })}
                />
                
                <input
                  type="text"
                  value={ingredient.amount}
                  onChange={(e) => handleUpdateIngredient(index, 'amount', e.target.value)}
                  placeholder="Amount"
                  className={css({
                    width: '120px',
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    color: '#ededed',
                    fontSize: '15px',
                    padding: '10px 12px',
                    outline: 'none',
                    _focus: { borderColor: '#2563eb' }
                  })}
                />
                
                <button
                  onClick={() => handleRemoveIngredient(index)}
                  className={css({
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#ef4444',
                    fontSize: '24px',
                    cursor: 'pointer',
                    padding: '4px',
                    _hover: { color: '#dc2626' }
                  })}
                >
                  ×
                </button>
              </div>
            ))}
            
            <button
              onClick={handleAddIngredient}
              className={css({
                padding: '12px',
                backgroundColor: 'transparent',
                border: '1px dashed #333',
                borderRadius: '8px',
                color: '#2563eb',
                fontSize: '15px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                _hover: {
                  borderColor: '#2563eb',
                  backgroundColor: 'rgba(37, 99, 235, 0.1)',
                }
              })}
            >
              + Add Ingredient
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className={css({
          display: 'flex',
          gap: '12px',
          marginTop: '24px',
          paddingTop: '16px',
          borderTop: '1px solid #333',
        })}>
          <button
            onClick={onClose}
            className={css({
              flex: 1,
              padding: '14px 24px',
              fontSize: '17px',
              fontWeight: '500',
              backgroundColor: 'transparent',
              color: '#999',
              border: '1px solid #333',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              _hover: {
                borderColor: '#666',
                color: '#ededed',
              }
            })}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className={css({
              flex: 1,
              padding: '14px 24px',
              fontSize: '17px',
              fontWeight: '500',
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
              _hover: {
                backgroundColor: '#3b82f6',
              }
            })}
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
