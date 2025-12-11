'use client';

import { useState } from 'react';
import { css, cx } from '@styled-system/css';
import WeeklyCalendar from '@/components/rehab/WeeklyCalendar';
import DayView from '@/components/rehab/DayView';
import PinEntryModal from '@/components/rehab/PinEntryModal';
import SettingsModal from '@/components/rehab/SettingsModal';
import type { Exercise, RehabEntry } from '@/types';
import { useRehabState } from '@/hooks/useRehabState';

interface KneeRehabClientProps {
    initialExercises: Exercise[];
    initialEntries: RehabEntry[];
}

export default function KneeRehabClient({ 
    initialExercises, 
    initialEntries 
}: KneeRehabClientProps) {
    const {
        exercises,
        entries,
        currentWeekStart,
        selectedDate,
        hasUnsavedNotes,
        settings,
        showSettingsModal,
        setShowSettingsModal,
        ouraScores,
        heartRates,
        showPinModal,
        selectedEntry,
        requireAuth,
        handlePinSuccess,
        handlePinCancel,
        handleSaveSettings,
        handlePreviousWeek,
        handleNextWeek,
        handleDateSelect,
        handleBackToCalendar,
        handleToggleRestDay,
        handleToggleVitamins,
        handleToggleProtein,
        handleUpdateNotes,
        handleSaveNotes,
        handleAddExercise,
        handleUpdateExercise,
        handleRemoveExercise,
        handleCreateExercise,
        handleUpdateExerciseDefinition,
        handleDeleteExercise,
        handleGoToToday,
    } = useRehabState({ initialExercises, initialEntries });

    const [settingsTab, setSettingsTab] = useState<'vitamins' | 'protein' | 'exercises'>('vitamins');

    const handleOpenSettings = (tab: 'vitamins' | 'protein' | 'exercises' = 'vitamins') => {
        setSettingsTab(tab);
        requireAuth(async () => setShowSettingsModal(true));
    };

    return (
        <div className={cx('knee-rehab-client', css({
            minHeight: '100vh',
            backgroundColor: '#0a0a0a',
            padding: '16px',
            md: {
                padding: '24px',
            }
        }))}>
            <div className={cx('container', css({
                maxWidth: '1800px',
                margin: '0 auto',
            }))}>


                {/* Calendar */}
                <div className={cx('calendar-section', css({
                    marginBottom: '32px',
                    display: selectedDate ? 'none' : 'block',
                    md: {
                        display: 'block',
                    }
                }))}>
                    <WeeklyCalendar
                        currentDate={currentWeekStart}
                        entries={entries}
                        exercises={exercises}
                        selectedDate={selectedDate}
                        onDateSelect={handleDateSelect}
                        onPreviousWeek={handlePreviousWeek}
                        onNextWeek={handleNextWeek}
                        onSettingsClick={handleOpenSettings}
                        onGoToToday={handleGoToToday}
                        ouraScores={ouraScores}
                        heartRates={heartRates}
                    />
                </div>

                {/* Day View */}
                {selectedDate && (
                    <div className={cx('day-section', css({
                        paddingLeft: '28px',
                        paddingRight: '28px',
                        md: {
                            paddingLeft: '0',
                            paddingRight: '0',
                        }
                    }))}>
                        <DayView
                            date={selectedDate}
                            entry={selectedEntry}
                            exercises={exercises}
                            entries={entries}
                            onAddExercise={handleAddExercise}
                            onUpdateExercise={handleUpdateExercise}
                            onRemoveExercise={handleRemoveExercise}
                            onToggleRestDay={handleToggleRestDay}
                            onToggleVitamins={handleToggleVitamins}
                            onToggleProtein={handleToggleProtein}
                            onUpdateNotes={handleUpdateNotes}
                            onSaveNotes={handleSaveNotes}
                            hasUnsavedNotes={hasUnsavedNotes}
                            onCreateExercise={handleCreateExercise}
                            onBack={handleBackToCalendar}
                            ouraScores={selectedDate ? ouraScores[selectedDate] : undefined}
                            heartRate={selectedDate ? heartRates[selectedDate] : undefined}
                        />
                    </div>
                )}
            </div>



            {/* PIN Entry Modal */}
            {showPinModal && (
                <PinEntryModal
                    onSuccess={handlePinSuccess}
                    onCancel={handlePinCancel}
                />
            )}

            {/* Settings Modal */}
            {showSettingsModal && (
                <SettingsModal
                    settings={settings}
                    exercises={exercises}
                    initialTab={settingsTab}
                    onSave={handleSaveSettings}
                    onUpdateExercise={handleUpdateExerciseDefinition}
                    onDeleteExercise={handleDeleteExercise}
                    onClose={() => setShowSettingsModal(false)}
                />
            )}
        </div>
    );
}

