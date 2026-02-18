import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

interface SettingsState {
    isHealthChatEnabled: boolean;
}

interface SettingsContextType {
    settings: SettingsState;
    toggleHealthChat: () => void;
    isLoading: boolean;
}

const defaultSettings: SettingsState = {
    isHealthChatEnabled: false,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const STORAGE_KEY = 'app_settings';

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<SettingsState>(defaultSettings);
    const [isLoading, setIsLoading] = useState(true);

    // Load settings from AsyncStorage on mount
    useEffect(() => {
        loadSettings();
    }, []);

    // Save settings to AsyncStorage whenever settings change
    useEffect(() => {
        if (!isLoading) {
            saveSettings();
        }
    }, [settings, isLoading]);

    const loadSettings = async () => {
        try {
            const storedSettings = await AsyncStorage.getItem(STORAGE_KEY);
            if (storedSettings) {
                const parsedSettings = JSON.parse(storedSettings);
                setSettings({
                    ...defaultSettings,
                    ...parsedSettings,
                });
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const saveSettings = async () => {
        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    };

    const toggleHealthChat = () => {
        setSettings(prev => ({ ...prev, isHealthChatEnabled: !prev.isHealthChatEnabled }));
    };

    const value: SettingsContextType = {
        settings,
        toggleHealthChat,
        isLoading,
    };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}
